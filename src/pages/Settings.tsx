import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  Lock,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTheme, type ThemePreference } from "../lib/theme";
import { useStore } from "../lib/store";
import { cn, toneGradients } from "../lib/utils";
import { TEAM } from "../data/mock";
import {
  PERMISSION_MODULES,
  ROLES,
  TEAM_ROLES,
  type RoleId,
} from "../data/business";
import { Avatar, Badge, Button, Field, inputClass, PageHeader, ProgressBar, Toggle } from "../components/ui";

type Section = "appearance" | "profile" | "notifications" | "agent" | "team";

const sections: { id: Section; label: string; icon: typeof Palette; hint: string }[] = [
  { id: "appearance", label: "Appearance", icon: Palette, hint: "Theme & brand" },
  { id: "profile", label: "Profile", icon: UserRound, hint: "Your details" },
  { id: "notifications", label: "Notifications", icon: Bell, hint: "What reaches you" },
  { id: "agent", label: "AI preferences", icon: Sparkles, hint: "Agent guardrails" },
  { id: "team", label: "Team & access", icon: UsersRound, hint: "Roles and permissions" },
];

const themeOptions: { id: ThemePreference; label: string; icon: typeof Sun; description: string }[] = [
  { id: "light", label: "Light", icon: Sun, description: "Warm paper, crisp type" },
  { id: "dark", label: "Dark", icon: Moon, description: "Studio after hours" },
  { id: "system", label: "System", icon: Monitor, description: "Follow your device" },
];

function SectionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ThemePreview({ mode }: { mode: "light" | "dark" | "system" }) {
  const light = (
    <div className="relative h-[72px] flex-1 overflow-hidden rounded-md border border-[#e8e2dd] bg-[#f7f5f3]">
      <div className="absolute inset-y-0 left-0 w-4 bg-[#efebe7]" />
      <div className="ml-6 mr-2 mt-2 space-y-1">
        <div className="h-1 w-9 rounded-full bg-[#1b1716]/70" />
        <div className="flex gap-1">
          <div className="h-5 flex-1 rounded border border-[#e8e2dd] bg-white" />
          <div className="h-5 flex-1 rounded border border-[#e8e2dd] bg-white" />
        </div>
        <div className="h-3 rounded border border-[#e8e2dd] bg-white" />
        <div className="h-1 w-6 rounded-full bg-[#bf0b0b]" />
      </div>
    </div>
  );
  const dark = (
    <div className="relative h-[72px] flex-1 overflow-hidden rounded-md border border-[#2f2727] bg-[#0d0b0b]">
      <div className="absolute inset-y-0 left-0 w-4 bg-[#141111]" />
      <div className="ml-6 mr-2 mt-2 space-y-1">
        <div className="h-1 w-9 rounded-full bg-[#f6f2f0]/70" />
        <div className="flex gap-1">
          <div className="h-5 flex-1 rounded border border-[#2a2323] bg-[#191616]" />
          <div className="h-5 flex-1 rounded border border-[#2a2323] bg-[#191616]" />
        </div>
        <div className="h-3 rounded border border-[#2a2323] bg-[#191616]" />
        <div className="h-1 w-6 rounded-full bg-[#d61c1c]" />
      </div>
    </div>
  );
  if (mode === "system") {
    return (
      <div className="flex gap-1">
        {light}
        {dark}
      </div>
    );
  }
  return <div className="flex">{mode === "light" ? light : dark}</div>;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { agents, tasks, projects, roles, rolePermissions } = useStore();
  const leadAgent = agents[0];
  const [section, setSection] = useState<Section>("appearance");
  const [selectedRole, setSelectedRole] = useState<RoleId>("owner");
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("Jawad Al Amien");
  const [email, setEmail] = useState("jawad@playdesign.co");
  const [role, setRole] = useState("Founder & Creative Director");
  const [timezone, setTimezone] = useState("Europe/Stockholm");
  const [bio, setBio] = useState(
    "Founder of Playdesign Studio. Brand systems, digital products and the occasional very loud launch.",
  );
  const [avatarTone, setAvatarTone] = useState(6);
  const [notifications, setNotifications] = useState({
    inbox: true,
    deals: true,
    content: true,
    digest: false,
    agent: true,
    escalations: true,
  });
  const [agentName, setAgentName] = useState(leadAgent?.name ?? "Agent");
  const [tone, setTone] = useState("Warm & direct");
  const [autonomy, setAutonomy] = useState(84);
  const [guardrails, setGuardrails] = useState({
    approval: true,
    sentiment: true,
    scheduling: true,
    autoSend: false,
  });

  const activeSection = sections.find((item) => item.id === section) ?? sections[0];

  const saveProfile = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const notificationRows: { key: keyof typeof notifications; title: string; description: string }[] = [
    { key: "inbox", title: "New conversations", description: "When a new lead starts a conversation on any channel." },
    { key: "deals", title: "Deal stage changes", description: "When an agent or a teammate moves a deal in the pipeline." },
    { key: "content", title: "Content approvals", description: "When a post is ready for review or has been published." },
    { key: "digest", title: "Weekly digest", description: "Monday morning summary of pipeline, content and agent runs." },
    { key: "agent", title: "Agent activity", description: "A quiet feed of what your agents handled while you were away." },
    { key: "escalations", title: "Escalations", description: "High-value or at-risk threads that need a human decision." },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Tune the workspace, your profile and how your agents work with the studio. The brand accent is locked to Playdesign red."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[84px] lg:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-line p-4">
              <div className="flex items-center gap-3">
                <Avatar name={name} tone={avatarTone} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
                  <div className="truncate text-[10.5px] text-faint">{email}</div>
                  <Badge tone="accent" className="mt-1.5">
                    Admin
                  </Badge>
                </div>
              </div>
            </div>
            <nav className="p-1.5">
              {sections.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      section === item.id ? "bg-surface-3" : "hover:bg-surface-2",
                    )}
                  >
                    <Icon
                      size={15}
                      className={cn(section === item.id ? "text-accent" : "text-faint")}
                      strokeWidth={1.9}
                    />
                    <span className="flex-1">
                      <span className={cn("block text-[12px] font-medium", section === item.id ? "text-ink" : "text-muted")}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[9.5px] text-faint">{item.hint}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="card mt-3 p-4">
            <div className="flex items-center justify-between">
              <span className="overline">Workspace</span>
              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] text-accent-text">PRO</span>
            </div>
            <div className="mt-2 text-[12.5px] font-medium text-ink">Playdesign Studio</div>
            <p className="mt-0.5 text-[10.5px] text-faint">8 seats · 3 agents · unlimited contacts</p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-[62%] rounded-full bg-accent" />
            </div>
            <p className="mt-1.5 text-[9.5px] text-faint">62% of monthly automation included</p>
          </div>
        </aside>

        <div className="space-y-4">
          {section === "appearance" && (
            <>
              <SectionCard
                title="Appearance"
                description="Light and dark are both first-class. Choose how the studio looks."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const active = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        className={cn(
                          "rounded-xl border p-2 text-left transition-all",
                          active
                            ? "border-accent/50 bg-accent-soft/20 ring-1 ring-accent/20"
                            : "border-line hover:border-line-strong hover:bg-surface-2/50",
                        )}
                      >
                        <ThemePreview mode={option.id} />
                        <div className="mt-2.5 flex items-center justify-between px-0.5">
                          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                            <Icon size={12} className="text-muted" />
                            {option.label}
                          </span>
                          <span
                            className={cn(
                              "grid size-4 place-items-center rounded-full border",
                              active ? "border-accent bg-accent text-white" : "border-line",
                            )}
                          >
                            {active && <Check size={9} strokeWidth={3} />}
                          </span>
                        </div>
                        <p className="mt-0.5 px-0.5 text-[9.5px] text-faint">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard
                title="Brand accent"
                description="The accent ties buttons, charts and agent moments together."
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#BF0B0B] shadow-[0_12px_36px_-12px_rgba(191,11,11,0.8)]">
                    <span className="text-[11px] font-semibold text-white">PD</span>
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-medium text-ink">#BF0B0B</span>
                      <Badge tone="accent">Brand accent</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <Lock size={10} /> Locked to the Playdesign identity
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    {[
                      { label: "Accent", color: "#BF0B0B" },
                      { label: "Success", color: "#2fbf8f" },
                      { label: "Warning", color: "#e1a448" },
                      { label: "Info", color: "#72a0ff" },
                    ].map((swatch) => (
                      <div key={swatch.label} className="text-center">
                        <span
                          className="mx-auto block size-6 rounded-full border border-black/10"
                          style={{ backgroundColor: swatch.color }}
                        />
                        <span className="mt-1.5 block text-[9px] text-faint">{swatch.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
                  <div className="flex items-center gap-2.5 text-[11px] text-muted">
                    <CheckCircle2 size={14} className="text-success" />
                    WCAG AA contrast verified across light and dark surfaces.
                  </div>
                  <span className="font-mono text-[9.5px] text-faint">Last reviewed Oct 2026</span>
                </div>
              </SectionCard>
            </>
          )}

          {section === "profile" && (
            <SectionCard title="Profile" description="How you appear across the workspace and to your team.">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
                <Avatar name={name} tone={avatarTone} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Avatar style</div>
                  <p className="mt-0.5 text-[10.5px] text-faint">Initials adapt to the tone you pick.</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setAvatarTone(tone)}
                        aria-label={`Avatar tone ${tone}`}
                        className={cn(
                          "size-6 rounded-full bg-gradient-to-br transition-transform",
                          toneGradients[tone],
                          avatarTone === tone
                            ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                            : "hover:scale-110",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
                </Field>
                <Field label="Email">
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className={inputClass} />
                </Field>
                <Field label="Role">
                  <input value={role} onChange={(event) => setRole(event.target.value)} className={inputClass} />
                </Field>
                <Field label="Timezone">
                  <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className={inputClass}>
                    {["Europe/Stockholm", "Europe/London", "America/New_York", "Asia/Singapore", "Asia/Jakarta"].map((zone) => (
                      <option key={zone}>{zone}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Short bio" className="sm:col-span-2">
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    rows={3}
                    className={cn(inputClass, "resize-none")}
                  />
                </Field>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-[10px] text-faint">Visible to your workspace only.</span>
                <Button variant="primary" onClick={saveProfile}>
                  {saved ? (
                    <>
                      <Check size={14} /> Saved
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </SectionCard>
          )}

          {section === "notifications" && (
            <SectionCard title="Notifications" description="Agents are quiet by default. Choose what deserves a ping.">
              <div className="space-y-1">
                {notificationRows.map((row, index) => (
                  <div key={row.key}>
                    {(index === 0 || index === 3 || index === 4) && (
                      <div className="overline pb-1.5 pt-4 first:pt-0">
                        {index === 0 ? "Inbox & pipeline" : index === 3 ? "Reports" : agentName}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 rounded-lg px-1 py-2.5">
                      <div>
                        <div className="text-[12px] font-medium text-ink">{row.title}</div>
                        <div className="mt-0.5 text-[10.5px] text-muted">{row.description}</div>
                      </div>
                      <Toggle
                        checked={notifications[row.key]}
                        onChange={(checked) =>
                          setNotifications((current) => ({ ...current, [row.key]: checked }))
                        }
                        label={`Toggle ${row.title}`}
                      />
                    </div>
                    {index !== notificationRows.length - 1 && <div className="h-px bg-line" />}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
                <div className="text-[11px] text-muted">
                  Weekly digest lands <span className="font-medium text-ink">Mondays at 08:00</span>
                </div>
                <select
                  className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[11px] text-muted focus:outline-none"
                  defaultValue="Email + in-app"
                  aria-label="Digest channel"
                >
                  <option>Email + in-app</option>
                  <option>In-app only</option>
                  <option>Email only</option>
                  <option>Off</option>
                </select>
              </div>
            </SectionCard>
          )}

          {section === "agent" && (
            <>
              <SectionCard title="AI preferences" description="Give your agent a voice, a name and clear guardrails.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Agent name">
                    <input value={agentName} onChange={(event) => setAgentName(event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Tone of voice">
                    <select value={tone} onChange={(event) => setTone(event.target.value)} className={inputClass}>
                      {["Warm & direct", "Concise", "Consultative", "Playful"].map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="mt-5 rounded-xl border border-line bg-surface-2/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12px] font-medium text-ink">Autonomy level</div>
                      <div className="mt-0.5 text-[10.5px] text-faint">How far {agentName} can go without asking.</div>
                    </div>
                    <span className="font-mono text-[15px] font-medium text-ink">{autonomy}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={autonomy}
                    onChange={(event) => setAutonomy(Number(event.target.value))}
                    aria-label="Agent autonomy"
                    className="mt-3 w-full"
                    style={{ "--range-fill": `${autonomy}%` } as CSSProperties}
                  />
                  <div className="mt-1.5 flex justify-between font-mono text-[8.5px] text-faint">
                    <span>Always ask</span>
                    <span>Fully autonomous</span>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="overline mb-2">Guardrails</div>
                  <div className="space-y-0.5">
                    {[
                      { key: "approval" as const, title: "Require approval for deals over $20k", description: `${agentName} drafts, but never sends or commits on high-value threads.` },
                      { key: "sentiment" as const, title: "Escalate negative or at-risk sentiment", description: "Hand the thread to a human when the tone turns cold." },
                      { key: "scheduling" as const, title: "Allow scheduling without approval", description: "Book and reschedule meetings inside existing availability." },
                      { key: "autoSend" as const, title: "Auto-send routine replies", description: `Let ${agentName} reply to simple logistics questions instantly.` },
                    ].map((guardrail) => (
                      <div key={guardrail.key} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
                        <div>
                          <div className="text-[11.5px] font-medium text-ink">{guardrail.title}</div>
                          <div className="mt-0.5 text-[10px] text-muted">{guardrail.description}</div>
                        </div>
                        <Toggle
                          checked={guardrails[guardrail.key]}
                          onChange={(checked) =>
                            setGuardrails((current) => ({ ...current, [guardrail.key]: checked }))
                          }
                          label={`Toggle ${guardrail.title}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Model & data" description="What powers your agents and how your data is handled.">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <div className="text-[12px] font-medium text-ink">{leadAgent?.model ?? "Je.el Agent"}</div>
                      <div className="mt-0.5 text-[10px] text-faint">128k context · brand-tuned · multi-channel</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="success" dot>
                      SOC 2 aligned
                    </Badge>
                    <Badge tone="neutral">No training on your data</Badge>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-line px-3.5 py-3 text-[10.5px]">
                  <span className="text-muted">Example reply in your tone</span>
                  <span className="font-mono text-[9.5px] text-faint">Updated automatically</span>
                </div>
                <p className="mt-2 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[11.5px] leading-relaxed text-muted">
                  “Hi Elif — great to hear the direction landed. I'll have the warm-palette hero to you by 4pm
                  today, with a side-by-side so you can compare in context. Anything else you'd like us to push?”
                </p>
              </SectionCard>
            </>
          )}

          {section === "team" && (
            <>
              <SectionCard
                title="Team"
                description="Members of this workspace, their role and their current load. Access follows the role, not the person."
              >
                <div className="space-y-1">
                  {TEAM.map((member) => {
                    const membership = TEAM_ROLES[member.id];
                    const role = ROLES.find((entry) => entry.id === membership?.roleId);
                    const openTasks = tasks.filter((task) => task.ownerId === member.id && task.status !== "done").length;
                    const memberProjects = projects.filter(
                      (project) => project.managerId === member.id || project.teamIds.includes(member.id),
                    ).length;
                    const load = Math.min(100, openTasks * 12 + memberProjects * 8);
                    return (
                      <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-lg px-1 py-2.5">
                        <Avatar name={member.name} tone={member.tone} size="md" />
                        <div className="min-w-[150px] flex-1">
                          <div className="text-[12px] font-medium text-ink">{member.name}</div>
                          <div className="text-[10px] text-faint">
                            {member.role}
                            {membership ? ` · ${membership.department}` : ""}
                          </div>
                        </div>
                        <Badge tone={member.isAgent ? "accent" : "neutral"}>{role?.label ?? "Member"}</Badge>
                        <div className="hidden w-[150px] sm:block">
                          <div className="flex items-center justify-between text-[9px] text-faint">
                            <span>{openTasks} open tasks</span>
                            <span>{memberProjects} projects</span>
                          </div>
                          <ProgressBar value={load} className="mt-1" tone={load >= 70 ? "warning" : "success"} />
                        </div>
                        <Badge tone={membership?.active ? "success" : "neutral"} dot={membership?.active}>
                          {membership?.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[9.5px] text-faint">
                  Workload is derived from open tasks and project membership. It is a signal, not a performance score.
                </p>
              </SectionCard>

              <SectionCard
                title="Roles & permissions"
                description="Module access per role. Owner has full access; client and agent are always scoped."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value as RoleId)}
                    aria-label="Role"
                    className={cn(inputClass, "h-9 max-w-[240px] py-0")}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10.5px] text-muted">
                    {roles.find((role) => role.id === selectedRole)?.description}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {PERMISSION_MODULES.map((module) => {
                    const allowed = rolePermissions[selectedRole].includes(module);
                    return (
                      <div
                        key={module}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-2.5 py-2",
                          allowed ? "border-line bg-surface-2/40" : "border-dashed border-line",
                        )}
                      >
                        <span className={cn("text-[11px]", allowed ? "text-ink" : "text-faint")}>{module}</span>
                        {allowed ? (
                          <CheckCircle2 size={13} className="text-success" />
                        ) : (
                          <Lock size={12} className="text-faint" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3 text-[10px] text-muted">
                  <ShieldCheck size={14} className="text-success" />
                  Owner and admin can change roles. Finance stays owner-only in this demo, and clients only ever see their
                  own projects.
                </div>
              </SectionCard>
            </>
          )}

          <div className="flex items-center gap-1.5 px-1 text-[10px] text-faint">
            <Lock size={10} /> Changes are saved to the Playdesign workspace
            <span className="ml-auto font-mono">{activeSection.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
