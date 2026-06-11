import { ExerciseView } from "@/components/ExerciseView";

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseView id={id} />;
}
