import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function Breadcrumbs({
  trail,
}: {
  trail: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Ruta" className="mb-5">
      <ol className="text-muted-foreground flex items-center gap-1 text-sm">
        {trail.map((step, index) => (
          <li key={step.label} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" />}
            {step.href ? (
              <Link href={step.href} className="hover:text-foreground transition-colors">
                {step.label}
              </Link>
            ) : (
              <span className="text-foreground truncate font-medium">{step.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
