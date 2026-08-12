import Image from "next/image";

import { TypeDots } from "@/components/type-dot";

export function CardRow({
  name,
  number,
  printedTotal,
  setName,
  imageUrl,
  types,
  note,
  children,
}: {
  name: string;
  number: string;
  printedTotal: number;
  setName: string;
  imageUrl: string | null;
  types: string[];
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="slab flex items-center gap-3.5 rounded-2xl p-3">
      <div className="ring-edge relative aspect-[63/88] w-12 shrink-0 overflow-hidden rounded-lg ring-1">
        {imageUrl && (
          <Image src={imageUrl} alt={name} fill sizes="48px" className="object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <TypeDots types={types} />
        </div>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {number}
          <span className="text-muted-foreground/50">/{printedTotal}</span>
          <span className="mx-1.5">·</span>
          {setName}
        </p>
        {note}
      </div>

      {children}
    </div>
  );
}
