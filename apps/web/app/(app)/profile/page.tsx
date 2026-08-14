"use client";

import {
  Brain,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/screen-header";
import { UserAvatar } from "@/components/user-avatar";
import { clearAccessToken, apiClient } from "@/lib/api-client";
import { useUrlState } from "@/lib/url-state";
import { useForgetPreference } from "@/lib/api/hooks/useForgetPreference";
import { useGetShareLink } from "@/lib/api/hooks/useGetShareLink";
import { useListPreferences } from "@/lib/api/hooks/useListPreferences";
import { useCreateShareLink } from "@/lib/api/hooks/useCreateShareLink";
import { useRevokeShareLink } from "@/lib/api/hooks/useRevokeShareLink";
import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

const SECTIONS = [
  { id: "cuenta", label: "Cuenta", icon: User },
  { id: "publico", label: "Perfil público", icon: Link2 },
  { id: "asistente", label: "Lo que sabe el asistente", icon: Brain },
  { id: "seguridad", label: "Seguridad", icon: KeyRound },
] as const;

export default function AccountPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Account />
    </Suspense>
  );
}

function Account() {
  const { data: session, isPending } = authClient.useSession();
  const [params, setParam] = useUrlState();
  const section = params.get("s") ?? "cuenta";

  if (isPending) return <Skeleton className="h-96 rounded-2xl" />;

  const user = session?.user;

  return (
    <>
      <ScreenHeader title="Tu cuenta" />

      <div className="grid gap-8 lg:grid-cols-[200px_1fr] lg:items-start">
        {/* A rail inside the page, not another sidebar: these are settings you
            visit occasionally, and they should not cost a column elsewhere. */}
        <nav aria-label="Secciones de la cuenta">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  onClick={() => setParam({ s: id })}
                  aria-current={section === id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
                    section === id
                      ? "bg-secondary font-medium"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {section === "cuenta" && <Identity user={user} />}
          {section === "publico" && <PublicProfile userId={user?.id} />}
          {section === "asistente" && <AgentMemory />}
          {section === "seguridad" && <Security />}
        </div>
      </div>
    </>
  );
}

/** A settings row: what it is on the left, what it says on the right. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-edge flex flex-wrap items-center justify-between gap-4 border-b py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-muted-foreground mt-0.5 max-w-md text-xs">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="ring-edge bg-surface rounded-2xl px-5 py-1 ring-1">
      <header className="border-edge border-b py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground mt-1 text-sm">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Identity({ user }: { user: { id: string; email: string; name?: string } | undefined }) {
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar el nombre.");
    toast.success("Nombre actualizado");
  };

  return (
    <Panel title="Cuenta" hint="Cómo te ven los demás coleccionistas y cómo entras.">
      <div className="border-edge flex items-center gap-4 border-b py-5">
        <UserAvatar value={user?.email} size={56} />
        <div className="min-w-0">
          <p className="font-medium">{user?.name || "Sin nombre"}</p>
          <p className="text-muted-foreground truncate text-sm">{user?.email}</p>
        </div>
      </div>

      <div className="border-edge border-b py-4">
        <Label htmlFor="name" className="text-sm font-medium">
          Nombre
        </Label>
        <p className="text-muted-foreground mt-0.5 mb-2 text-xs">
          Es el nombre que aparece en tus ofertas y en tu perfil público.
        </p>
        <div className="flex gap-2">
          <Input
            id="name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            disabled={saving || !name.trim() || name.trim() === user?.name}
            onClick={save}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      <Row label="Correo" hint="Con este correo entras. Todavía no se puede cambiar desde aquí.">
        <span className="text-muted-foreground font-mono text-sm">{user?.email}</span>
      </Row>

      <Row label="Avatar" hint="Se genera a partir de tu correo y es único: no hay nada que subir.">
        <UserAvatar value={user?.email} size={32} />
      </Row>
    </Panel>
  );
}

function PublicProfile({ userId }: { userId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data: link } = useGetShareLink({ client: { client: apiClient } });
  const [copied, setCopied] = useState(false);

  const create = useCreateShareLink({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: () => toast.error("No se pudo crear el enlace."),
    },
  });
  const revoke = useRevokeShareLink({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Enlace revocado");
      },
      onError: () => toast.error("No se pudo revocar."),
    },
  });

  const url = link ? `${window.location.origin}/s/${link.token}` : null;

  return (
    <Panel
      title="Perfil público"
      hint="Lo que cualquier coleccionista ve de ti. Nunca incluye cuánto vale tu colección."
    >
      <Row label="Tu perfil de coleccionista" hint="Nombre, sets que coleccionas y tus repetidas.">
        {userId && (
          <Link
            href={`/collectors/${userId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Ver como lo ven
            <ExternalLink />
          </Link>
        )}
      </Row>

      <Row
        label="Enlace para compartir tu colección"
        hint="Una página pública y revocable con tus cartas. Sin totales de dinero."
      >
        {url ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              Revocar
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            Crear enlace
          </Button>
        )}
      </Row>
    </Panel>
  );
}

/**
 * What the assistant wrote down about the reader, and the way to unwrite it.
 *
 * The agent stores these without being asked, so the person they describe has
 * to be able to read them and throw any of them away.
 */
function AgentMemory() {
  const queryClient = useQueryClient();
  const { data: memories, isPending } = useListPreferences({ client: { client: apiClient } });

  const forget = useForgetPreference({
    client: { client: apiClient },
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Olvidado");
      },
      onError: () => toast.error("No se pudo olvidar."),
    },
  });

  return (
    <Panel
      title="Lo que sabe el asistente"
      hint="Datos que guardó de tus conversaciones para no volver a preguntártelos."
    >
      {isPending && <div className="py-6"><Skeleton className="h-16" /></div>}

      {memories?.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Todavía no guardó nada. Cuando le cuentes algo estable sobre cómo
          coleccionas, lo anota aquí.
        </p>
      )}

      {memories?.map((memory) => (
        <Row key={memory.key} label={memory.key.replace(/_/g, " ")}>
          <span className="text-muted-foreground max-w-sm truncate text-sm">
            {typeof memory.value?.text === "string" ? memory.value.text : JSON.stringify(memory.value)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Olvidar ${memory.key}`}
            disabled={forget.isPending}
            onClick={() => forget.mutate({ key: memory.key })}
          >
            <Trash2 />
          </Button>
        </Row>
      ))}
    </Panel>
  );
}

function Security() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const change = async () => {
    setSaving(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (error) return toast.error("No se pudo cambiar. Revisa la contraseña actual.");
    setCurrent("");
    setNext("");
    toast.success("Contraseña cambiada. Las demás sesiones se cerraron.");
  };

  return (
    <Panel title="Seguridad" hint="Tu contraseña y las sesiones abiertas.">
      <div className="border-edge border-b py-4">
        <p className="text-sm font-medium">Cambiar contraseña</p>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Al cambiarla se cierran las demás sesiones.
        </p>
        <div className="flex max-w-md flex-col gap-2">
          <Input
            type="password"
            value={current}
            placeholder="Contraseña actual"
            aria-label="Contraseña actual"
            onChange={(event) => setCurrent(event.target.value)}
          />
          <Input
            type="password"
            value={next}
            placeholder="Contraseña nueva"
            aria-label="Contraseña nueva"
            onChange={(event) => setNext(event.target.value)}
          />
          <Button
            variant="outline"
            className="self-start"
            disabled={saving || current.length < 8 || next.length < 8}
            onClick={change}
          >
            {saving ? "Cambiando…" : "Cambiar contraseña"}
          </Button>
        </div>
      </div>

      <Row label="Cerrar sesión" hint="Solo en este dispositivo.">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await authClient.signOut();
            clearAccessToken();
            router.replace("/sign-in");
          }}
        >
          <LogOut />
          Salir
        </Button>
      </Row>
    </Panel>
  );
}
