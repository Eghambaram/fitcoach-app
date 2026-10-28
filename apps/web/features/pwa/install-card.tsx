"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Chrome's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "installed" | "ios" | "other";

function detect(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

const noop = () => () => undefined;

/**
 * "Install FitCoach" (PROMPT §14) for Settings (trainers) and More (clients): the browser's
 * install prompt where it exists, step-by-step Add to Home Screen on iPhone, nothing once installed.
 */
export function InstallCard() {
  const platform = useSyncExternalStore<Platform | null>(noop, detect, () => null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === null || platform === "installed" || installed) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-lime">
          <Download className="size-5 text-lime-foreground" aria-hidden="true" />
        </span>
        <div>
          <h2 id="install-title" className="font-semibold">
            Install FitCoach on your phone
          </h2>
          <p className="text-sm text-muted-foreground">
            Open it from your home screen like an app, full screen and one tap away.
          </p>
        </div>
      </div>
      {platform === "ios" ? (
        <ol className="flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="font-semibold">1.</span> In Safari, tap
            <Share className="size-4" aria-hidden="true" />
            <span className="font-semibold">Share</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold">2.</span> Choose
            <SquarePlus className="size-4" aria-hidden="true" />
            <span className="font-semibold">Add to Home Screen</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold">3.</span> Tap <span className="font-semibold">Add</span>
          </li>
        </ol>
      ) : prompt ? (
        <div>
          <Button
            variant="dark"
            onClick={async () => {
              await prompt.prompt();
              const choice = await prompt.userChoice;
              setPrompt(null);
              if (choice.outcome === "accepted") setInstalled(true);
            }}
          >
            Install app
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          In Chrome on Android, open the menu (⋮) and choose{" "}
          <span className="font-semibold text-foreground">Install app</span> or{" "}
          <span className="font-semibold text-foreground">Add to Home screen</span>.
        </p>
      )}
    </Card>
  );
}
