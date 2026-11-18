import type { Metadata } from "next";
import StudentLoader from "@/components/student/StudentLoader";
import "./student.css";

export const metadata: Metadata = { title: "Report" };

export default function StudentPage() {
  return <StudentLoader />;
}
