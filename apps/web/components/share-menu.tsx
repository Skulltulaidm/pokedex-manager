"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient, getAccessToken } from "@/lib/api-client";
import { createShareLink } from "@/lib/api/clients/createShareLink";
import { revokeShareLink } from "@/lib/api/clients/revokeShareLink";
import {
  getShareLinkQueryKey,
  useGetShareLink,
} from "@/lib/api/hooks/useGetShareLink";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export function ShareMenu() {
  const queryClient = useQueryClient();
  const { data: link } = useGetShareLink({ client: { client: apiClient } });
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getShareLinkQueryKey() });

  async function download(format: "csv" | "json") {
    const token = await getAccessToken();
    const response = await fetch(
      `${API_URL}/api/v1/collection/export?format=${format}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );

    if (!response.ok) {
      toast.error("No se pudo exportar la colección.");
      return;
    }

    // The endpoint needs an Authorization header, so the file cannot be fetched
    // by pointing the browser at the URL.
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pokedex.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    setBusy(true);
    try {
      const created = link ?? (await createShareLink({ client: apiClient }));
      await navigator.clipboard.writeText(`${location.origin}/s/${created.token}`);
      await refresh();
      toast.success("Enlace copiado", {
        description: "Cualquiera con él puede ver tu colección.",
      });
    } catch {
      toast.error("No se pudo crear el enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    await revokeShareLink({ client: apiClient });
    await refresh();
    toast.success("Enlace desactivado");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Compartir y exportar">
            {busy ? <Loader2 className="animate-spin" /> : <Share2 />}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Compartir
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={share}>
            {link ? <Check /> : <Link2 />}
            {link ? "Copiar enlace público" : "Crear enlace público"}
          </DropdownMenuItem>
          {link && (
            <DropdownMenuItem variant="destructive" onClick={revoke}>
              <Trash2 />
              Desactivar enlace
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Exportar
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => download("csv")}>
            <Download />
            Descargar CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => download("json")}>
            <Download />
            Descargar JSON
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
