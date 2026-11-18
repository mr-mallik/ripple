import type { Metadata } from "next";
import StudentLoader from "@/components/student/StudentLoader";
import "./student.css";

export const metadata: Metadata = { title: "Women's safety" };

export default function StudentPage() {
  return <StudentLoader />;
}
