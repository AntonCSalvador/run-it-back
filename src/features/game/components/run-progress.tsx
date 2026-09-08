export type MacroStage = "draft" | "igl" | "tournament" | "recap";

const stages: readonly { id: MacroStage; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "igl", label: "IGL" },
  { id: "tournament", label: "Tournament" },
  { id: "recap", label: "Recap" },
];

export function RunProgress({ stage, detail }: { stage: MacroStage; detail: string }) {
  const currentIndex = stages.findIndex(item => item.id === stage);

  return (
    <nav className="run-progress" aria-label="Run progress">
      <ol>
        {stages.map((item, index) => (
          <li
            key={item.id}
            aria-current={item.id === stage ? "step" : undefined}
            data-state={index < currentIndex ? "complete" : item.id === stage ? "current" : "upcoming"}
          >
            {item.label}
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite">{detail}</p>
    </nav>
  );
}
