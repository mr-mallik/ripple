"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { getStudentClient } from "@/lib/supabase";
import type { LatLng } from "@/lib/geo";
import type { Block, NearbyWalker, TrustedContact, WalkRequest } from "@/lib/types";

const OPEN: WalkRequest["status"][] = ["pending", "accepted", "started"];

/**
 * Walk together: who's heading out nearby, walk requests (live), blocks and
 * trusted contacts. Exact locations never leave the database: other students
 * only see a first name, a destination area and a rounded walking time.
 */
export function useWalkTogether({
  userId,
  verified,
  posRef,
  onIncoming,
  onUpdate,
}: {
  userId: string | null;
  verified: boolean;
  posRef: RefObject<LatLng>;
  onIncoming: (r: WalkRequest) => void;
  onUpdate: (r: WalkRequest, before: WalkRequest | undefined) => void;
}) {
  const supabase = getStudentClient();
  const [nearby, setNearby] = useState<NearbyWalker[] | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [requests, setRequests] = useState<WalkRequest[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const latest = useRef({ requests, onIncoming, onUpdate });
  useEffect(() => {
    latest.current = { requests, onIncoming, onUpdate };
  });

  const loadMine = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const [r, b, c] = await Promise.all([
      supabase.from("walk_requests").select("*").gte("updated_at", since).order("updated_at", { ascending: false }).limit(30),
      supabase.from("blocks").select("blocked_id, blocked_name").order("created_at", { ascending: false }),
      supabase.from("trusted_contacts").select("id, name, phone").order("created_at"),
    ]);
    setRequests((r.data as WalkRequest[]) ?? []);
    setBlocks((b.data as Block[]) ?? []);
    setContacts((c.data as TrustedContact[]) ?? []);
  }, [supabase, userId]);

  // Load, then keep walk requests live.
  useEffect(() => {
    if (!userId) return;
    const first = window.setTimeout(loadMine, 0);
    const channel = supabase
      .channel(`walk-requests-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "walk_requests" }, (payload) => {
        const r = payload.new as WalkRequest;
        if (!r?.id) return;
        const { requests: known, onIncoming: incoming, onUpdate: updated } = latest.current;
        const before = known.find((x) => x.id === r.id);
        if (payload.eventType === "INSERT" && r.to_user === userId) incoming(r);
        else updated(r, before);
        setRequests((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
      })
      .subscribe();
    return () => {
      window.clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, loadMine]);

  const refreshNearby = useCallback(
    async (destination: string, minutes: number, visible: boolean) => {
      if (!verified) return;
      const p = posRef.current;
      if (visible) {
        await supabase.rpc("set_walk_offer", { p_lat: p.lat, p_lng: p.lng, p_destination: destination, p_minutes: minutes });
      }
      const { data, error } = await supabase.rpc("nearby_walkers", { p_lat: p.lat, p_lng: p.lng });
      if (error) {
        setNearbyError("Couldn't check who's nearby. Check your connection and try again.");
        return;
      }
      setNearbyError(null);
      setNearby((data as NearbyWalker[]) ?? []);
    },
    [supabase, verified, posRef],
  );

  const hideMe = useCallback(async () => {
    await supabase.rpc("clear_walk_offer");
  }, [supabase]);

  const act = useCallback(
    async (id: string, action: "accept" | "decline" | "cancel" | "meet" | "start" | "end", meetingPoint?: string) => {
      const { data, error } = await supabase.rpc("update_walk_request", {
        p_id: id,
        p_action: action,
        p_meeting_point: meetingPoint ?? null,
      });
      if (error) return { error: error.message };
      const r = data as WalkRequest;
      setRequests((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
      return { request: r };
    },
    [supabase],
  );

  const send = useCallback(
    async (to: NearbyWalker, destination: string) => {
      const p = posRef.current;
      const { data, error } = await supabase.rpc("send_walk_request", {
        p_to: to.user_id,
        p_lat: p.lat,
        p_lng: p.lng,
        p_destination: destination,
      });
      if (error) return { error: error.message };
      const r = data as WalkRequest;
      setRequests((prev) => [r, ...prev.filter((x) => x.id !== r.id).map((x) => (x.from_user === userId && (x.status === "pending" || x.status === "accepted") ? { ...x, status: "cancelled" as const } : x))]);
      return { request: r };
    },
    [supabase, posRef, userId],
  );

  const block = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("blocks").insert({ blocked_id: id, blocked_name: name.slice(0, 60) });
      if (error) return error.message;
      setBlocks((b) => [{ blocked_id: id, blocked_name: name }, ...b.filter((x) => x.blocked_id !== id)]);
      setNearby((n) => n?.filter((w) => w.user_id !== id) ?? n);
      return null;
    },
    [supabase],
  );

  const unblock = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("blocks").delete().eq("blocked_id", id);
      if (error) return error.message;
      setBlocks((b) => b.filter((x) => x.blocked_id !== id));
      return null;
    },
    [supabase],
  );

  const raiseConcern = useCallback(
    async (id: string, name: string, reason: string) => {
      const { error } = await supabase
        .from("student_concerns")
        .insert({ reported_id: id, reported_name: name.slice(0, 60), reason });
      return error?.message ?? null;
    },
    [supabase],
  );

  const addContact = useCallback(
    async (name: string, phone: string) => {
      const { data, error } = await supabase
        .from("trusted_contacts")
        .insert({ name: name.slice(0, 60), phone: phone.slice(0, 30) })
        .select("id, name, phone")
        .single();
      if (error || !data) return error?.message ?? "Couldn't save the contact.";
      setContacts((c) => [...c, data as TrustedContact]);
      return null;
    },
    [supabase],
  );

  const removeContact = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("trusted_contacts").delete().eq("id", id);
      if (error) return error.message;
      setContacts((c) => c.filter((x) => x.id !== id));
      return null;
    },
    [supabase],
  );

  const blockedIds = useMemo(() => new Set(blocks.map((b) => b.blocked_id)), [blocks]);
  const incoming = useMemo(
    () => requests.filter((r) => r.to_user === userId && r.status === "pending" && !blockedIds.has(r.from_user)),
    [requests, userId, blockedIds],
  );
  // The one walk request I'm part of right now, if any.
  const current = useMemo(
    () => requests.find((r) => OPEN.includes(r.status) && !(r.to_user === userId && r.status === "pending")) ?? null,
    [requests, userId],
  );

  return {
    nearby,
    nearbyError,
    refreshNearby,
    hideMe,
    requests,
    incoming,
    current,
    send,
    act,
    blocks,
    block,
    unblock,
    raiseConcern,
    contacts,
    addContact,
    removeContact,
    reload: loadMine,
  };
}

export type WalkTogetherApi = ReturnType<typeof useWalkTogether>;

/** The other person in a walk request, from my point of view. */
export function partnerOf(r: WalkRequest, me: string | null) {
  return r.from_user === me
    ? { id: r.to_user, name: r.to_name }
    : { id: r.from_user, name: r.from_name };
}
