import { useState, type FormEvent } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import type { BriefSource } from "../data/briefs";
import { Button, Field, inputClass, Modal, Segmented } from "./ui";

const EXAMPLE = {
  client: "Northwind Studio",
  project: "Northwind rebrand",
  contact: "elif@northwind.studio",
  raw: "Hi Playdesign — we need to refresh the Northwind identity: logo refresh, brand guidelines and a landing page. Launch is on 2026-11-20. Budget around $18,000. Can you send a scope and proposal?",
};

export function NewBriefModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (values: { source: BriefSource; client: string; project: string; contact?: string; raw: string }) => void;
}) {
  const [source, setSource] = useState<BriefSource>("email");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [contact, setContact] = useState("");
  const [raw, setRaw] = useState("");

  const loadExample = () => {
    setClient(EXAMPLE.client);
    setProject(EXAMPLE.project);
    setContact(EXAMPLE.contact);
    setRaw(EXAMPLE.raw);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!client.trim() || !project.trim() || !raw.trim()) return;
    onSubmit({ source, client, project, contact, raw });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New brief"
      description="Paste an email or form submission. The agent extracts the scope and asks for anything missing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="brief-form">
            <Sparkles size={14} /> Extract scope
          </Button>
        </>
      }
    >
      <form id="brief-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Received via">
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: "email", label: "Email" },
              { value: "form", label: "Form" },
            ]}
            className="w-full"
          />
        </Field>
        <Field label="Contact" hint="Optional">
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className={inputClass}
            placeholder="name@client.com"
          />
        </Field>
        <Field label="Client">
          <input
            value={client}
            onChange={(event) => setClient(event.target.value)}
            className={inputClass}
            placeholder="Northwind Studio"
            required
            autoFocus
          />
        </Field>
        <Field label="Project">
          <input
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className={inputClass}
            placeholder="Rebrand or campaign name"
            required
          />
        </Field>
        <Field label="Brief content" className="sm:col-span-2">
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            className={`${inputClass} min-h-[160px] resize-y leading-relaxed`}
            placeholder="Paste the client email or form submission here…"
            required
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
          <p className="text-[11px] leading-relaxed text-faint">
            Demo extraction runs locally. No external model call, nothing is sent.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={loadExample}>
            <Wand2 size={13} /> Use example
          </Button>
        </div>
      </form>
    </Modal>
  );
}
