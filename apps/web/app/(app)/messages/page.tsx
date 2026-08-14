/** Nothing open yet. A phone shows only the list, so this is for wide screens. */
export default function MessagesPage() {
  return (
    <div className="ring-edge bg-surface/60 hidden min-h-0 place-items-center rounded-2xl px-6 text-center ring-1 lg:grid">
      <p className="text-muted-foreground max-w-xs text-sm">
        Elegí una conversación de la izquierda, o escribile a alguien desde su perfil, desde
        una oferta o desde el tablón.
      </p>
    </div>
  );
}
