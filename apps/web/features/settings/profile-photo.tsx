"use client";

import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type UploadedPhotoResponse,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap, uploadFile } from "@/lib/api/browser";
import { Avatar } from "../shell/app-shell";

/** Mirrors the API's checks so people get an answer before a 10 MB upload; the API re-checks everything. */
export function checkPhoto(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a JPEG, PNG or WebP photo. On iPhone, share it as JPEG (Most Compatible).";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Photos can be up to 10 MB.";
  return null;
}

export function ProfilePhoto({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile<UploadedPhotoResponse>("/v1/files/profile-photo", file),
    onSuccess: () => {
      setError(null);
      toast.success("Photo updated.");
      router.refresh();
    },
    onError: (failure) => setError(failure.message),
  });

  const remove = useMutation({
    mutationFn: () => unwrap(browserApi.DELETE("/v1/files/profile-photo")),
    onSuccess: () => {
      setConfirmRemove(false);
      toast.success("Photo removed.");
      router.refresh();
    },
    onError: (failure) => toast.error(failure.message),
  });

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = checkPhoto(file);
    if (problem) {
      setError(problem);
      return;
    }
    upload.mutate(file);
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {avatarUrl ? (
        // Public-bucket image (CDN in production); no Next image optimisation needed.
        <Image
          src={avatarUrl}
          alt="Your photo"
          width={96}
          height={96}
          unoptimized
          className="size-24 rounded-full object-cover"
        />
      ) : (
        <Avatar name={displayName} className="size-24 text-2xl" />
      )}
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <p className="font-semibold">Your photo</p>
          <p className="text-sm text-muted-foreground">
            Shown to your clients and on your public page. JPEG, PNG or WebP, up to 10 MB. Location
            and camera details are removed.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={onFile}
          className="sr-only"
          aria-label="Choose a photo"
          aria-describedby={error ? errorId : undefined}
          tabIndex={-1}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="dark"
            loading={upload.isPending}
            disabled={!online}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? null : <Camera aria-hidden="true" />}
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl ? (
            <Button variant="outline" disabled={!online} onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove your photo?"
        description="Your initials will show instead. You can upload a new photo any time."
        confirmLabel="Remove photo"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
