import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  ArrowLeft, ArrowRight, CalendarDays, CarFront, Check, ChevronRight, CircleAlert,
  Clock3, Compass, Flag, Home, ListChecks, LogOut, Menu,
  MapPin, Pencil, Plus, Route as RouteIcon, ShieldCheck, Star, Trash2, Users, WalletCards, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  CoRiderPreference, Gender, GroupCreationMode, Landmark, RideGroupMatchType, RideGroupStatus,
  getGetAvailableStudentsQueryKey,
  TimeSlot, getGetCurrentStudentQueryKey, getGetDashboardQueryKey, getGetRecurringSchedulesQueryKey,
  getGetRideGroupQueryKey, getGetRideGroupsQueryKey, getGetRideRequestQueryKey, getGetRideRequestsQueryKey,
  useCancelRideRequest, useCompleteRideGroup, useCreateRecurringSchedule, useCreateRideRequest,
  useDeleteRecurringSchedule, useFlagNoShow, useGetAvailableStudents, useGetCurrentStudent, useGetDashboard, useGetRecurringSchedules,
  useGetRideGroup, useGetRideGroups, useGetRideRequest, useGetRideRequests, useLoginStudent,
  useLogoutStudent, useNudgeFarePayer, useRateRider, useRegisterStudent, useUpdateRecurringSchedule, useUpdateRideRequest,
} from '@workspace/api-client-react';
import type {
  RecurringSchedule, RecurringScheduleInput, RideGroup, RideGroupDetails, RideRequest,
  RideRequestInput, RideRequestUpdate,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const landmarks: { value: typeof Landmark[keyof typeof Landmark]; label: string; note: string }[] = [
  { value: Landmark['north-gate'], label: 'North Gate', note: 'Main campus entrance' },
  { value: Landmark['library-circle'], label: 'Library Circle', note: 'Quiet, central pickup' },
  { value: Landmark['hostel-block-a'], label: 'Hostel Block A', note: 'Residence-side pickup' },
  { value: Landmark['main-market'], label: 'Main Market', note: 'Across the east road' },
  { value: Landmark['east-gate'], label: 'East Gate', note: 'Fast exit toward town' },
];
const slots: { value: typeof TimeSlot[keyof typeof TimeSlot]; label: string; note: string }[] = [
  { value: TimeSlot['06:00'], label: '6:00 AM', note: 'Early start' },
  { value: TimeSlot['07:00'], label: '7:00 AM', note: 'Morning commute' },
  { value: TimeSlot['08:00'], label: '8:00 AM', note: 'First lecture window' },
  { value: TimeSlot['09:00'], label: '9:00 AM', note: 'Morning' },
  { value: TimeSlot['10:00'], label: '10:00 AM', note: 'Late morning' },
  { value: TimeSlot['11:00'], label: '11:00 AM', note: 'Before lunch' },
  { value: TimeSlot['12:00'], label: '12:00 PM', note: 'Midday' },
  { value: TimeSlot['13:00'], label: '1:00 PM', note: 'After lunch' },
  { value: TimeSlot['14:00'], label: '2:00 PM', note: 'Afternoon' },
  { value: TimeSlot['15:00'], label: '3:00 PM', note: 'Mid-afternoon' },
  { value: TimeSlot['16:00'], label: '4:00 PM', note: 'Afternoon commute' },
  { value: TimeSlot['17:00'], label: '5:00 PM', note: 'Evening commute' },
  { value: TimeSlot['18:00'], label: '6:00 PM', note: 'Evening' },
  { value: TimeSlot['19:00'], label: '7:00 PM', note: 'Last listed window' },
];
const genderOptions: { value: typeof Gender[keyof typeof Gender]; label: string }[] = [
  { value: Gender.woman, label: 'Woman' },
  { value: Gender.man, label: 'Man' },
  { value: Gender['non-binary'], label: 'Non-binary' },
  { value: Gender['prefer-not-to-say'], label: 'Prefer not to say' },
];

function labelForLandmark(value: string) { return landmarks.find((item) => item.value === value)?.label ?? value.replaceAll('-', ' '); }
function labelForSlot(value: string) { return slots.find((item) => item.value === value)?.label ?? value; }
function preferenceLabel(value: string) { return value === CoRiderPreference['same-gender-only'] ? 'Same-gender riders' : 'Any co-rider'; }
function formatRideDate(date: string) { try { return format(parseISO(date), 'EEE, d MMM'); } catch { return date; } }
function initials(name: string) { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }
function kolkataDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}
function isRideTimeAvailable(date: string, timeSlot: string, now = new Date()) {
  const current = kolkataDateTime(now);
  if (date > current.date) return true;
  if (date < current.date) return false;
  const [hour, minute] = timeSlot.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) && hour * 60 + minute > current.minutes;
}
function useKolkataClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-primary shadow-sm">
      <RouteIcon size={20} strokeWidth={2.4} />
    </span>
    {!compact && <span className="leading-tight"><strong className="block font-display text-[1.15rem] font-semibold tracking-tight">Campus</strong><span className="block text-[11px] font-semibold uppercase tracking-[.22em] text-sidebar-foreground/60">Rideshare</span></span>}
  </Link>;
}

function Button({ children, variant = 'primary', className = '', type = 'button', onClick, disabled, testId }: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; className?: string; type?: 'button' | 'submit'; onClick?: () => void; disabled?: boolean; testId?: string;
}) {
  const styles = { primary: 'bg-primary text-primary-foreground shadow-sm hover:brightness-105', secondary: 'bg-secondary text-secondary-foreground hover:bg-accent/45', ghost: 'bg-transparent text-foreground hover:bg-muted', danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15' };
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-55 ${styles[variant]} ${className}`}>{children}</button>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-foreground"><span>{label}</span>{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}

function TextInput({ testId, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { testId?: string }) {
  return <input {...props} data-testid={testId} className={`h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20 ${props.className ?? ''}`} />;
}

function SelectInput({ testId, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { testId?: string }) {
  return <select {...props} data-testid={testId} className={`h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20 ${props.className ?? ''}`}>{children}</select>;
}

function OptionCard({ number, title, note, selected, onClick, testId, disabled = false }: { number: number; title: string; note?: string; selected: boolean; onClick: () => void; testId: string; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} data-selected={selected} data-testid={testId} className="selection-card flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left disabled:cursor-not-allowed disabled:opacity-45">
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}`}>{number}</span>
    <span className="min-w-0"><strong className="block text-sm">{title}</strong>{note && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{note}</span>}</span>
    {selected && <Check size={17} className="ml-auto shrink-0 text-primary" />}
  </button>;
}

function Badge({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'warm' | 'green' | 'danger' }) {
  const colors = { soft: 'bg-secondary text-secondary-foreground', warm: 'bg-accent/35 text-primary', green: 'bg-emerald-100 text-emerald-800', danger: 'bg-destructive/10 text-destructive' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em] ${colors[tone]}`}>{children}</span>;
}

function LoadingState({ lines = 3 }: { lines?: number }) {
  return <div className="grid gap-3" data-testid="loading-state">{Array.from({ length: lines }).map((_, index) => <div key={index} className="soft-card grid gap-3 p-5"><div className="skeleton h-4 w-28 rounded-full" /><div className="skeleton h-6 w-3/4 rounded-lg" /><div className="skeleton h-3 w-1/2 rounded-full" /></div>)}</div>;
}

function ErrorState({ onRetry, message = 'We could not load this just now.' }: { onRetry?: () => void; message?: string }) {
  return <div className="soft-card grid place-items-center gap-3 px-6 py-14 text-center" data-testid="error-state"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><CircleAlert size={24} /></span><div><h2 className="font-display text-xl">A small detour</h2><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>{onRetry && <Button variant="secondary" onClick={onRetry} testId="button-retry">Try again</Button>}</div>;
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: typeof Compass; title: string; copy: string; action?: ReactNode }) {
  return <div className="soft-card grid place-items-center gap-3 px-6 py-14 text-center" data-testid="empty-state"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><Icon size={25} /></span><div><h2 className="font-display text-xl">{title}</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p></div>{action}</div>;
}

function GroupCard({ group, compact = false }: { group: RideGroup; compact?: boolean }) {
  return <Link href={`/groups/${group.id}`} className={`soft-card soft-card-hover block ${compact ? 'p-4' : 'p-5'}`} data-testid={`card-group-${group.id}`}>
    <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={group.matchType === RideGroupMatchType.exact ? 'green' : 'warm'}>{group.matchType === RideGroupMatchType.exact ? 'Exact match' : 'Nearby match'}</Badge>{group.status === RideGroupStatus.completed && <Badge>Completed</Badge>}</div><h3 className="mt-3 font-display text-xl">{formatRideDate(group.date)}</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><CarFront size={19} /></span></div>
    <div className="mt-4 grid gap-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Clock3 size={15} className="text-primary" />{labelForSlot(group.timeSlot)}</span><span className="flex items-center gap-2"><MapPin size={15} className="text-primary" />{labelForLandmark(group.landmark)}</span></div>
    <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-1.5"><Users size={14} />{group.memberCount} riders</span><span className="flex items-center gap-1.5 text-foreground"><WalletCards size={14} />₹{group.farePerHead} / head <ChevronRight size={15} /></span></div>
  </Link>;
}

function AppFrame({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = useGetCurrentStudent();
  const logout = useLogoutStudent();
  const nav = [{ href: '/', label: 'Today', icon: Home }, { href: '/groups', label: 'My groups', icon: Users }, { href: '/schedules', label: 'Schedules', icon: CalendarDays }, { href: '/history', label: 'History', icon: ListChecks }];
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { queryClient.clear(); setLocation('/login'); } });
  const student = current.data;
  return <div className="device-frame app-shell flex" data-mobile-open={mobileOpen}>
    <aside className={`fixed inset-y-0 left-0 z-30 w-[252px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform md:static md:flex md:translate-x-0 ${mobileOpen ? 'flex translate-x-0' : 'hidden -translate-x-full'}`} data-testid="sidebar">
      <div className="flex items-center justify-between"><Brand /><button className="rounded-lg p-2 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="mt-12"><p className="px-3 text-[10px] font-bold uppercase tracking-[.2em] text-sidebar-foreground/45">Your commute</p><nav className="mt-3 grid gap-1">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}><Icon size={18} />{label}</Link>)}</nav></div>
      <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-xs font-bold text-primary">{student ? initials(student.name) : 'CR'}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{student?.name ?? 'Campus rider'}</p><p className="truncate text-xs text-sidebar-foreground/55">{student?.studentId ?? 'Student account'}</p></div></div><button onClick={signOut} className="mt-4 flex items-center gap-2 text-xs font-semibold text-sidebar-foreground/60 hover:text-sidebar-foreground" data-testid="button-logout"><LogOut size={14} />Sign out</button></div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-primary/20 md:hidden" data-testid="button-overlay" />}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:h-[76px] md:px-10">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 hover:bg-muted md:hidden" aria-label="Open navigation" data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="mobile-only-brand md:hidden"><Brand compact /></div>
          <div className="desktop-network-status hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />Campus network is ready</div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/request/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-105 sm:px-3.5" aria-label="Request a ride" data-testid="link-header-request"><Plus size={17} /><span className="hidden sm:inline">Request a ride</span><span className="sm:hidden">Request</span></Link>
          <span className="hidden h-9 w-9 place-items-center rounded-xl bg-secondary text-xs font-bold text-primary sm:grid" data-testid="text-header-initials">{student ? initials(student.name) : 'CR'}</span>
        </div>
      </header>
       <main className="mx-auto max-w-[1260px] px-4 py-6 pb-28 md:px-10 md:py-10">{children}</main>
     </div>
     <nav className={`mobile-bottom-nav fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-[0_12px_35px_hsl(191_38%_22%/.18)] backdrop-blur md:hidden ${mobileOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`} aria-label="Mobile navigation" data-testid="mobile-bottom-nav">
       <Link href="/" onClick={() => setMobileOpen(false)} className={`mobile-nav-item ${location === '/' ? 'mobile-nav-item-active' : ''}`} data-testid="mobile-nav-today"><Home size={18} /><span>Today</span></Link>
       <Link href="/groups" onClick={() => setMobileOpen(false)} className={`mobile-nav-item ${location.startsWith('/groups') ? 'mobile-nav-item-active' : ''}`} data-testid="mobile-nav-groups"><Users size={18} /><span>Groups</span></Link>
       <Link href="/request/new" onClick={() => setMobileOpen(false)} className="mobile-nav-request" aria-label="Request a ride" data-testid="mobile-nav-request"><Plus size={21} /></Link>
       <Link href="/schedules" onClick={() => setMobileOpen(false)} className={`mobile-nav-item ${location === '/schedules' ? 'mobile-nav-item-active' : ''}`} data-testid="mobile-nav-schedules"><CalendarDays size={18} /><span>Plans</span></Link>
       <Link href="/history" onClick={() => setMobileOpen(false)} className={`mobile-nav-item ${location === '/history' ? 'mobile-nav-item-active' : ''}`} data-testid="mobile-nav-history"><ListChecks size={18} /><span>History</span></Link>
     </nav>
  </div>;
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</p><h1 className="mt-2 font-display text-4xl leading-none tracking-tight text-foreground md:text-5xl">{title}</h1>{copy && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{copy}</p>}</div>{action}</div>;
}

function DashboardPage() {
  const dashboard = useGetDashboard();
  const requests = useGetRideRequests();
  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.isError || !dashboard.data) return <ErrorState onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;
  const pendingRequests = requests.data ?? data.pendingRequests;
  return <div className="page-enter"><PageHeading eyebrow="Your daily rhythm" title={`Good to see you, ${data.student.name.split(' ')[0]}.`} copy="A calmer way to get across campus and back again." action={<Link href="/request/new" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105" data-testid="link-dashboard-request"><Plus size={18} />Plan a ride</Link>} />
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="soft-card relative overflow-hidden border border-border/80 bg-secondary/55 p-6 text-foreground md:p-8"><div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[22px] border-accent/30" /><div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full border-[18px] border-primary/10" /><div className="relative"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary"><span className="h-2 w-2 rounded-full bg-accent" />Suggested for you</div><h2 className="mt-5 max-w-lg font-display text-3xl leading-tight text-foreground md:text-4xl">{data.suggestedRide.label}</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">One tap sets up the usual details. You can change anything before it goes out.</p><div className="mt-7 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-card/85 px-3 py-2 text-foreground">{formatRideDate(data.suggestedRide.date)}</span><span className="rounded-full bg-card/85 px-3 py-2 text-foreground">{labelForSlot(data.suggestedRide.timeSlot)}</span><span className="rounded-full bg-card/85 px-3 py-2 text-foreground">{labelForLandmark(data.suggestedRide.landmark)}</span></div><Link href="/request/new" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3" data-testid="link-use-suggestion">Use this plan <ArrowRight size={16} /></Link></div></section>
      <section className="soft-card flex flex-col justify-between bg-secondary/55 p-6"><div><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">A good habit</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-card text-primary"><ShieldCheck size={18} /></span></div><h2 className="mt-5 font-display text-3xl">Keep your ride details close.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Recurring schedules make your week predictable without making it rigid.</p></div><Link href="/schedules" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid="link-schedules-card">View schedules <ArrowRight size={16} /></Link></section>
    </div>
    <div className="mt-9 grid gap-8 xl:grid-cols-[1.35fr_.65fr]"><section><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Next up</p><h2 className="mt-1 font-display text-2xl">Your upcoming rides</h2></div><Link href="/groups" className="text-sm font-bold text-primary" data-testid="link-see-groups">See all <ArrowRight size={15} className="ml-1 inline" /></Link></div>{data.upcomingGroups.length ? <div className="grid gap-3 md:grid-cols-2">{data.upcomingGroups.slice(0, 4).map((group) => <GroupCard key={group.id} group={group} compact />)}</div> : <EmptyState icon={CarFront} title="Nothing booked yet" copy="When your next ride is matched, it will settle here." action={<Link href="/request/new" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-empty-request"><Plus size={16} />Request a ride</Link>} />}</section>
      <section><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">In motion</p><h2 className="mt-1 font-display text-2xl">Pending requests</h2></div><span className="grid h-8 min-w-8 place-items-center rounded-full bg-accent px-2 text-sm font-bold text-primary">{pendingRequests.length}</span></div>{pendingRequests.length ? <div className="grid gap-3">{pendingRequests.slice(0, 3).map((request) => <PendingRequest key={request.id} request={request} />)}</div> : <div className="soft-card p-5 text-sm leading-6 text-muted-foreground">No requests waiting. Your next plan can start whenever you are ready.</div>}</section>
    </div>
     {data.fareNudges.length > 0 && <section className="mt-8"><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Fare reminders</p><h2 className="mt-1 font-display text-2xl">A quick nudge from your ride group</h2></div><WalletCards size={20} className="text-primary" /></div><div className="grid gap-3 md:grid-cols-2">{data.fareNudges.slice(0, 4).map((nudge) => <Link key={nudge.id} href={`/groups/${nudge.groupId}`} className="soft-card soft-card-hover block p-4" data-testid={`card-fare-nudge-${nudge.id}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{nudge.senderName} is reminding you about the fare</p><p className="mt-1 text-xs text-muted-foreground">{formatRideDate(nudge.date)} · ₹{nudge.farePerHead} per head</p></div><ChevronRight size={17} className="shrink-0 text-primary" /></div></Link>)}</div></section>}
  </div>;
}

function ProtectedRoutes() {
  const [, setLocation] = useLocation();
  const current = useGetCurrentStudent();

  useEffect(() => {
    if (current.isError) setLocation('/login');
  }, [current.isError, setLocation]);

  if (current.isLoading || current.isError) return <LoadingState lines={3} />;

  return <AppFrame><Switch><Route path="/" component={DashboardPage} /><Route path="/request/new" component={NewRequestPageWithManual} /><Route path="/schedules" component={SchedulesPage} /><Route path="/groups" component={GroupsPage} /><Route path="/groups/:id" component={GroupDetailsPage} /><Route path="/history" component={HistoryPage} /><Route path="/requests/:id/edit" component={EditRequestPage} /><Route component={NotFoundPage} /></Switch></AppFrame>;
}

function PendingRequest({ request }: { request: RideRequest }) {
  return <Link href={`/requests/${request.id}/edit`} className="soft-card soft-card-hover block p-4" data-testid={`card-request-${request.id}`}><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold"><CalendarDays size={16} className="text-primary" />{formatRideDate(request.date)}</span><Badge tone="warm">Pending</Badge></div><div className="mt-3 grid gap-1 text-sm text-muted-foreground"><span>{labelForSlot(request.timeSlot)} · {labelForLandmark(request.landmark)}</span><span>{preferenceLabel(request.coRiderPreference)}</span></div><p className="mt-4 text-xs font-bold text-primary">Edit details <ChevronRight size={14} className="inline" /></p></Link>;
}

function AuthLayout({ children, title, copy }: { children: ReactNode; title: string; copy: string }) {
  return <div className="device-frame quiet-grid flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10"><div className="grid w-full max-w-[960px] overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_25px_80px_hsl(191_38%_22%/.10)] md:grid-cols-[.8fr_1.2fr]"><div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex"><Brand /><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary-foreground/60">A softer way to move</p><h2 className="mt-4 max-w-xs font-display text-4xl leading-[1.05]">The ride home can feel easy.</h2><p className="mt-5 max-w-xs text-sm leading-6 text-primary-foreground/70">Campus rideshare keeps familiar landmarks, familiar faces, and fair fares in one quiet place.</p></div><div className="flex items-center gap-2 text-xs text-primary-foreground/60"><ShieldCheck size={15} />Student community, built for everyday trips</div></div><div className="p-7 md:p-12"><div className="mb-8 md:hidden"><Brand /></div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-primary">Campus Rideshare</p><h1 className="mt-3 font-display text-4xl leading-none">{title}</h1><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{copy}</p>{children}</div></div></div>;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const login = useLoginStudent();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return <AuthLayout title="Welcome back." copy="Pick up where you left off. Your next campus ride is never far away."><form className="mt-8 grid gap-5" onSubmit={(event) => { event.preventDefault(); login.mutate({ data: { email, password } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetCurrentStudentQueryKey() }); setLocation('/'); } }); }}><Field label="College email"><TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@college.edu" required testId="input-email" /></Field><Field label="Password"><TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required testId="input-password" /></Field><div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground"><p className="font-semibold text-foreground">Demo Students (Password: password123)</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { setEmail('aarav.sharma@campus.edu'); setPassword('password123'); }} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted">Aarav Sharma</button><button type="button" onClick={() => { setEmail('priya.patel@campus.edu'); setPassword('password123'); }} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted">Priya Patel</button></div></div>{login.isError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="status-login-error">That email and password did not match. Try again.</p>}<Button type="submit" className="mt-1 w-full" disabled={login.isPending} testId="button-login">{login.isPending ? 'Signing you in…' : 'Sign in'} <ArrowRight size={17} /></Button><p className="text-center text-sm text-muted-foreground">New to the campus network? <Link href="/register" className="font-bold text-primary" data-testid="link-register">Create an account</Link></p></form></AuthLayout>;
}

function RegisterPage() {
  const [, setLocation] = useLocation(); const register = useRegisterStudent();
  const [form, setForm] = useState({
    studentId: '',
    name: '',
    email: '',
    password: '',
    gender: Gender['prefer-not-to-say'] as typeof Gender[keyof typeof Gender],
    upiPaymentLink: '',
    coRiderPreference: CoRiderPreference.any as typeof CoRiderPreference[keyof typeof CoRiderPreference],
  });
  return <AuthLayout title="Make the commute lighter." copy="A few details help us match you thoughtfully with people heading your way."><form className="mt-8 grid gap-4" onSubmit={(event) => {
    event.preventDefault();
    register.mutate({
      data: { ...form, upiPaymentLink: form.upiPaymentLink.trim() || null },
    }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetCurrentStudentQueryKey() }); setLocation('/'); } });
  }}><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" required testId="input-name" /></Field><Field label="Student ID"><TextInput value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} placeholder="e.g. 24CS104" required testId="input-student-id" /></Field></div><Field label="College email"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@college.edu" required testId="input-register-email" /></Field><Field label="Password" hint="At least 8 characters"><TextInput type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Choose a password" required testId="input-register-password" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Gender"><SelectInput value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as typeof form.gender })} testId="select-register-gender">{genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field><Field label="UPI payment link" hint="Optional — shown to riders after a completed ride"><TextInput type="text" value={form.upiPaymentLink} onChange={(event) => setForm({ ...form, upiPaymentLink: event.target.value })} placeholder="upi://pay?... or https://..." testId="input-register-upi" /></Field></div><div><p className="mb-2 text-sm font-semibold">Co-rider preference</p><div className="grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Any co-rider" note="Match by route and time" selected={form.coRiderPreference === CoRiderPreference.any} onClick={() => setForm({ ...form, coRiderPreference: CoRiderPreference.any })} testId="option-register-any" /><OptionCard number={2} title="Same-gender only" note="Match with riders who chose the same gender" selected={form.coRiderPreference === CoRiderPreference['same-gender-only']} onClick={() => setForm({ ...form, coRiderPreference: CoRiderPreference['same-gender-only'] })} testId="option-register-same-gender" /></div></div>{register.isError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="status-register-error">We could not create that account. Check your details and try again.</p>}<Button type="submit" className="mt-2 w-full" disabled={register.isPending} testId="button-register">{register.isPending ? 'Creating your account…' : 'Create student account'} <ArrowRight size={17} /></Button><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-bold text-primary" data-testid="link-login">Sign in</Link></p></form></AuthLayout>;
}

function NewRequestPage() {
  const [, setLocation] = useLocation(); const create = useCreateRideRequest(); const qc = useQueryClient();
  const [form, setForm] = useState<RideRequestInput>({ date: new Date().toISOString().slice(0, 10), timeSlot: TimeSlot['08:00'], landmark: Landmark['north-gate'], coRiderPreference: CoRiderPreference.any, creationMode: GroupCreationMode.automatic });
  const update = <K extends keyof RideRequestInput>(key: K, value: RideRequestInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="page-enter mx-auto max-w-4xl"><Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-dashboard"><ArrowLeft size={16} />Back to today</Link><PageHeading eyebrow="New ride request" title="Where are you headed?" copy="Choose a few familiar details. We will do the matching quietly in the background." /><form onSubmit={(event) => { event.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideGroupsQueryKey() }); setLocation('/groups'); } }); }} className="grid gap-7"><section className="soft-card p-5 md:p-7"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">01</span><div><h2 className="font-display text-2xl">When should we look?</h2><p className="text-sm text-muted-foreground">Pick the day and a comfortable window.</p></div></div><div className="mt-6 grid gap-5 md:grid-cols-[1fr_1.4fr]"><Field label="Travel date"><TextInput type="date" value={form.date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => update('date', event.target.value)} required testId="input-ride-date" /></Field><div><p className="mb-2 text-sm font-semibold">Time slot</p><div className="grid gap-2 sm:grid-cols-3">{slots.map((slot, index) => <OptionCard key={slot.value} number={index + 1} title={slot.label} note={slot.note} selected={form.timeSlot === slot.value} onClick={() => update('timeSlot', slot.value)} testId={`option-time-${slot.value}`} />)}</div></div></div></section><section className="soft-card p-5 md:p-7"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">02</span><div><h2 className="font-display text-2xl">Where will you meet?</h2><p className="text-sm text-muted-foreground">Fixed landmarks keep pickup clear for everyone.</p></div></div><div className="mt-6 grid gap-2 md:grid-cols-2">{landmarks.map((landmark, index) => <OptionCard key={landmark.value} number={index + 1} title={landmark.label} note={landmark.note} selected={form.landmark === landmark.value} onClick={() => update('landmark', landmark.value)} testId={`option-landmark-${landmark.value}`} />)}</div></section><section className="soft-card p-5 md:p-7"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">03</span><div><h2 className="font-display text-2xl">Who should join?</h2><p className="text-sm text-muted-foreground">Your preference guides the match.</p></div></div><div className="mt-6 grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Any co-rider" note="Best route availability" selected={form.coRiderPreference === CoRiderPreference.any} onClick={() => update('coRiderPreference', CoRiderPreference.any)} testId="option-request-any" /><OptionCard number={2} title="Same-gender only" note="A preference we respect" selected={form.coRiderPreference === CoRiderPreference['same-gender-only']} onClick={() => update('coRiderPreference', CoRiderPreference['same-gender-only'])} testId="option-request-same-gender" /></div><div className="mt-7 border-t border-border pt-6"><p className="mb-2 text-sm font-semibold">Group creation</p><div className="grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Automatic match" note="We find riders on a nearby route" selected={form.creationMode === GroupCreationMode.automatic} onClick={() => update('creationMode', GroupCreationMode.automatic)} testId="option-mode-automatic" /><OptionCard number={2} title="Manual group" note="You can choose riders later" selected={form.creationMode === GroupCreationMode.manual} onClick={() => update('creationMode', GroupCreationMode.manual)} testId="option-mode-manual" /></div></div></section>{create.isError && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="status-request-error">We could not send this request. Please check the details and try again.</p>}<div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="link-cancel-request">Cancel</Link><Button type="submit" disabled={create.isPending} className="sm:min-w-[190px]" testId="button-submit-request">{create.isPending ? 'Finding your ride…' : 'Find my ride'} <ArrowRight size={17} /></Button></div></form></div>;
}

function NewRequestPageWithManual() {
  const [, setLocation] = useLocation();
  const create = useCreateRideRequest();
  const qc = useQueryClient();
  const now = useKolkataClock();
  const [form, setForm] = useState<RideRequestInput>({
    date: new Date().toISOString().slice(0, 10),
    timeSlot: TimeSlot['08:00'],
    landmark: Landmark['north-gate'],
    coRiderPreference: CoRiderPreference.any,
    creationMode: GroupCreationMode.automatic,
    selectedStudentIds: [],
  });
  const available = useGetAvailableStudents({
    query: { enabled: form.creationMode === GroupCreationMode.manual, queryKey: getGetAvailableStudentsQueryKey() },
  });
  const selectedStudentIds = form.selectedStudentIds ?? [];
  const update = <K extends keyof RideRequestInput>(key: K, value: RideRequestInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleStudent = (studentId: number) => {
    const next = selectedStudentIds.includes(studentId)
      ? selectedStudentIds.filter((id) => id !== studentId)
      : [...selectedStudentIds, studentId];
    update('selectedStudentIds', next);
  };
  return <div className="page-enter mx-auto max-w-4xl">
    <Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-dashboard"><ArrowLeft size={16} />Back to today</Link>
    <PageHeading eyebrow="New ride request" title="Where are you headed?" copy="Choose a few familiar details. We will do the matching quietly in the background." />
    <form onSubmit={(event) => {
      event.preventDefault();
      create.mutate({ data: form }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetRideGroupsQueryKey() });
          setLocation('/groups');
        },
      });
    }} className="grid gap-7">
      <section className="soft-card p-5 md:p-7">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">01</span><div><h2 className="font-display text-2xl">When should we look?</h2><p className="text-sm text-muted-foreground">Pick the day and a comfortable window.</p></div></div>
       <div className="mt-6 grid gap-5 md:grid-cols-[1fr_1.4fr]">
           <Field label="Travel date"><TextInput type="date" value={form.date} min={kolkataDateTime(now).date} onChange={(event) => update('date', event.target.value)} required testId="input-ride-date" /></Field>
           <div><p className="mb-2 text-sm font-semibold">Time slot</p><p className="mb-2 text-xs text-muted-foreground">Past times today are unavailable.</p><div className="grid gap-2 sm:grid-cols-3">{slots.map((slot, index) => <OptionCard key={slot.value} number={index + 1} title={slot.label} note={slot.note} selected={form.timeSlot === slot.value} disabled={!isRideTimeAvailable(form.date, slot.value, now)} onClick={() => update('timeSlot', slot.value)} testId={`option-time-${slot.value}`} />)}</div></div>
        </div>
      </section>
      <section className="soft-card p-5 md:p-7">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">02</span><div><h2 className="font-display text-2xl">Where will you meet?</h2><p className="text-sm text-muted-foreground">Fixed landmarks keep pickup clear for everyone.</p></div></div>
        <div className="mt-6 grid gap-2 md:grid-cols-2">{landmarks.map((landmark, index) => <OptionCard key={landmark.value} number={index + 1} title={landmark.label} note={landmark.note} selected={form.landmark === landmark.value} onClick={() => update('landmark', landmark.value)} testId={`option-landmark-${landmark.value}`} />)}</div>
      </section>
      <section className="soft-card p-5 md:p-7">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">03</span><div><h2 className="font-display text-2xl">Who should join?</h2><p className="text-sm text-muted-foreground">Your preference guides the match.</p></div></div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Any co-rider" note="Best route availability" selected={form.coRiderPreference === CoRiderPreference.any} onClick={() => update('coRiderPreference', CoRiderPreference.any)} testId="option-request-any" /><OptionCard number={2} title="Same-gender only" note="A preference we respect" selected={form.coRiderPreference === CoRiderPreference['same-gender-only']} onClick={() => update('coRiderPreference', CoRiderPreference['same-gender-only'])} testId="option-request-same-gender" /></div>
         <div className="mt-7 border-t border-border pt-6"><p className="mb-2 text-sm font-semibold">Group creation</p><div className="grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Automatic match" note="We find riders on a nearby route" selected={form.creationMode === GroupCreationMode.automatic} onClick={() => update('creationMode', GroupCreationMode.automatic)} testId="option-mode-automatic" /><OptionCard number={2} title="Manual group" note="Choose specific riders now" selected={form.creationMode === GroupCreationMode.manual} onClick={() => update('creationMode', GroupCreationMode.manual)} testId="option-mode-manual" /></div><div className="mt-4 grid gap-2 rounded-2xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground" data-testid="group-mode-help"><p><strong className="text-foreground">Automatic match:</strong> we look for students with the same time and an exact or nearby landmark.</p><p><strong className="text-foreground">Manual group:</strong> you choose specific students now, and we add them to your group immediately.</p></div></div>
        {form.creationMode === GroupCreationMode.manual && <div className="mt-6 rounded-2xl bg-secondary/50 p-4" data-testid="manual-rider-picker">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">Choose your riders</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Pick people you already know from the available student list.</p></div><span className="rounded-full bg-card px-3 py-1 text-xs font-bold text-primary">{selectedStudentIds.length} selected</span></div>
          {available.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading available students…</p>}
          {available.isError && <p className="mt-4 text-sm text-destructive">We could not load the student list. Try again before creating a manual group.</p>}
          {available.data?.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{available.data.map((student, index) => <button type="button" key={student.id} onClick={() => toggleStudent(student.id)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${selectedStudentIds.includes(student.id) ? 'border-primary bg-card shadow-sm' : 'border-border/70 bg-card/60 hover:border-primary/40'}`} data-testid={`option-manual-student-${student.id}`}><span className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-primary">{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{student.name}</span><span className="block truncate text-xs text-muted-foreground">{student.studentId} · {student.ratingAverage.toFixed(1)} rating</span></span></span><span className={`grid h-6 w-6 place-items-center rounded-full ${selectedStudentIds.includes(student.id) ? 'bg-primary text-primary-foreground' : 'border border-border text-transparent'}`}><Check size={14} /></span></button>)}</div> : !available.isLoading && !available.isError ? <p className="mt-4 text-sm text-muted-foreground">No other students are available yet.</p> : null}
        </div>}
      </section>
      {create.isError && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="status-request-error">We could not send this request. Please check the details and try again.</p>}
       <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="link-cancel-request">Cancel</Link><Button type="submit" disabled={create.isPending || !isRideTimeAvailable(form.date, form.timeSlot, now) || (form.creationMode === GroupCreationMode.manual && selectedStudentIds.length === 0)} className="sm:min-w-[190px]" testId="button-submit-request">{create.isPending ? 'Creating your group…' : 'Find my ride'} <ArrowRight size={17} /></Button></div>
    </form>
  </div>;
}

function GroupsPage() {
  const groups = useGetRideGroups();
  if (groups.isLoading) return <LoadingState />;
  if (groups.isError || !groups.data) return <ErrorState onRetry={() => groups.refetch()} />;
  return <div className="page-enter"><PageHeading eyebrow="Your campus circle" title="Matched groups" copy="The people and routes that line up with your commute." action={<Link href="/request/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-groups-request"><Plus size={17} />New request</Link>} />{groups.data.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.data.map((group) => <GroupCard key={group.id} group={group} />)}</div> : <EmptyState icon={Users} title="Your circle is waiting" copy="Request a ride and we will look for students moving along the same campus corridor." action={<Link href="/request/new" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-groups-empty-request"><Plus size={16} />Request your first ride</Link>} />}</div>;
}

function HistoryPage() {
  const dashboard = useGetDashboard(); const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');
  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.isError || !dashboard.data) return <ErrorState onRetry={() => dashboard.refetch()} />;
  const list = tab === 'upcoming' ? dashboard.data.upcomingGroups : dashboard.data.completedGroups;
  return <div className="page-enter"><PageHeading eyebrow="Your rides" title="History" copy="A simple record of where you have been, and what is next." /><div className="mb-6 flex w-fit rounded-xl bg-muted p-1"><button onClick={() => setTab('upcoming')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'upcoming' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} data-testid="tab-upcoming">Upcoming</button><button onClick={() => setTab('completed')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'completed' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} data-testid="tab-completed">Completed</button></div>{list.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((group) => <GroupCard key={group.id} group={group} />)}</div> : <EmptyState icon={tab === 'upcoming' ? CalendarDays : Check} title={tab === 'upcoming' ? 'No upcoming rides' : 'No completed rides yet'} copy={tab === 'upcoming' ? 'Your next campus trip can start with one small request.' : 'Your completed rides will become a useful little travel record here.'} action={tab === 'upcoming' ? <Link href="/request/new" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-history-request">Request a ride</Link> : undefined} />}</div>;
}

function SchedulesPage() {
  const schedules = useGetRecurringSchedules(); const qc = useQueryClient();
  const create = useCreateRecurringSchedule(); const update = useUpdateRecurringSchedule(); const remove = useDeleteRecurringSchedule();
  const [editing, setEditing] = useState<number | null>(null); const [open, setOpen] = useState(false);
  const blank: RecurringScheduleInput = { daysOfWeek: [0, 1, 2, 3, 4], landmark: Landmark['north-gate'], timeSlot: TimeSlot['08:00'], coRiderPreference: CoRiderPreference.any };
  const [form, setForm] = useState<RecurringScheduleInput>(blank);
  const save = (event: React.FormEvent) => { event.preventDefault(); const done = () => { qc.invalidateQueries({ queryKey: getGetRecurringSchedulesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setOpen(false); setEditing(null); setForm(blank); }; if (editing) update.mutate({ scheduleId: editing, data: form }, { onSuccess: done }); else create.mutate({ data: form }, { onSuccess: done }); };
  if (schedules.isLoading) return <LoadingState />;
  if (schedules.isError || !schedules.data) return <ErrorState onRetry={() => schedules.refetch()} />;
  return <div className="page-enter"><PageHeading eyebrow="Set it once" title="Recurring schedules" copy="Keep your usual campus rhythm ready, without needing to remember it every morning." action={<Button onClick={() => { setOpen(true); setEditing(null); setForm(blank); }} testId="button-add-schedule"><Plus size={17} />Add schedule</Button>} />{open && <form onSubmit={save} className="soft-card mb-6 grid gap-6 border-accent/60 p-5 md:p-7"><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">{editing ? 'Edit schedule' : 'New schedule'}</p><h2 className="mt-1 font-display text-2xl">{editing ? 'Tune your routine' : 'Make mornings easier'}</h2></div><button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-muted" data-testid="button-close-schedule"><X size={18} /></button></div><div><p className="mb-2 text-sm font-semibold">Days of week</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{days.map((day, index) => { const selected = form.daysOfWeek.includes(index); return <button type="button" key={day} onClick={() => setForm({ ...form, daysOfWeek: selected ? form.daysOfWeek.filter((item) => item !== index) : [...form.daysOfWeek, index].sort() })} data-testid={`option-day-${index}`} data-selected={selected} className="selection-card rounded-xl border border-border bg-card px-2 py-3 text-xs font-bold">{day}</button>; })}</div></div><div className="grid gap-5 md:grid-cols-3"><Field label="Landmark"><SelectInput value={form.landmark} onChange={(event) => setForm({ ...form, landmark: event.target.value as typeof Landmark[keyof typeof Landmark] })} testId="select-schedule-landmark">{landmarks.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectInput></Field><Field label="Time slot"><SelectInput value={form.timeSlot} onChange={(event) => setForm({ ...form, timeSlot: event.target.value as typeof TimeSlot[keyof typeof TimeSlot] })} testId="select-schedule-time">{slots.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectInput></Field><Field label="Co-rider preference"><SelectInput value={form.coRiderPreference} onChange={(event) => setForm({ ...form, coRiderPreference: event.target.value as typeof CoRiderPreference[keyof typeof CoRiderPreference] })} testId="select-schedule-preference"><option value={CoRiderPreference.any}>Any co-rider</option><option value={CoRiderPreference['same-gender-only']}>Same-gender only</option></SelectInput></Field></div><div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setOpen(false)} testId="button-cancel-schedule">Cancel</Button><Button type="submit" disabled={create.isPending || update.isPending || form.daysOfWeek.length === 0} testId="button-save-schedule">{create.isPending || update.isPending ? 'Saving…' : 'Save schedule'}</Button></div></form>}{schedules.data.length ? <div className="grid gap-3">{schedules.data.map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule} onEdit={() => { setEditing(schedule.id); setForm({ daysOfWeek: schedule.daysOfWeek, landmark: schedule.landmark, timeSlot: schedule.timeSlot, coRiderPreference: schedule.coRiderPreference }); setOpen(true); }} onDelete={() => { if (window.confirm('Remove this recurring schedule?')) remove.mutate({ scheduleId: schedule.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetRecurringSchedulesQueryKey() }) }); }} />)}</div> : <EmptyState icon={CalendarDays} title="No routines saved" copy="Save the rides you take most often, then start each week with less to think about." action={<Button onClick={() => setOpen(true)} testId="button-empty-add-schedule"><Plus size={16} />Add a schedule</Button>} />}</div>;
}

function ScheduleRow({ schedule, onEdit, onDelete }: { schedule: RecurringSchedule; onEdit: () => void; onDelete: () => void }) {
  return <div className="soft-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-schedule-${schedule.id}`}><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><CalendarDays size={19} /></span><div><div className="flex flex-wrap gap-1.5">{schedule.daysOfWeek.map((day) => <span key={day} className="rounded-md bg-muted px-2 py-1 text-[11px] font-bold">{days[day]}</span>)}</div><p className="mt-2 text-sm font-bold">{labelForSlot(schedule.timeSlot)} · {labelForLandmark(schedule.landmark)}</p><p className="mt-1 text-xs text-muted-foreground">{preferenceLabel(schedule.coRiderPreference)}</p></div></div><div className="flex gap-2 sm:shrink-0"><Button variant="secondary" onClick={onEdit} testId={`button-edit-schedule-${schedule.id}`}><Pencil size={15} />Edit</Button><Button variant="danger" onClick={onDelete} testId={`button-delete-schedule-${schedule.id}`}><Trash2 size={15} /></Button></div></div>;
}

function GroupDetailsPage() {
  const params = useParams<{ id: string }>(); const id = Number(params.id); const qc = useQueryClient();
  const current = useGetCurrentStudent();
  const group = useGetRideGroup(id, { query: { enabled: !!id, queryKey: getGetRideGroupQueryKey(id) } });
  const complete = useCompleteRideGroup(); const noShow = useFlagNoShow(); const rate = useRateRider(); const [ratings, setRatings] = useState<Record<number, number>>({});
  if (group.isLoading) return <LoadingState lines={2} />;
  if (group.isError || !group.data) return <ErrorState onRetry={() => group.refetch()} message="This ride group is not available right now." />;
  const data = group.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetRideGroupQueryKey(id) }); qc.invalidateQueries({ queryKey: getGetRideGroupsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); };
  return <div className="page-enter mx-auto max-w-5xl"><Link href="/groups" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground" data-testid="link-back-groups"><ArrowLeft size={16} />Back to groups</Link><PageHeading eyebrow={data.status === RideGroupStatus.completed ? 'Completed ride' : 'Ride details'} title={formatRideDate(data.date)} copy={`${labelForSlot(data.timeSlot)} from ${labelForLandmark(data.landmark)}.`} action={<Badge tone={data.matchType === RideGroupMatchType.exact ? 'green' : 'warm'}>{data.matchType === RideGroupMatchType.exact ? 'Exact match' : 'Nearby match'}</Badge>} /><div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><div className="grid gap-6"><section className="soft-card p-5 md:p-7"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Meet here</p><h2 className="mt-1 font-display text-2xl">{labelForLandmark(data.landmark)}</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary"><MapPin size={21} /></span></div><div className="mt-6 grid gap-2">{data.landmarks.map((landmark, index) => <div key={`${landmark}-${index}`} className="flex items-center gap-3 rounded-xl bg-muted/70 px-3 py-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-card text-xs font-bold text-primary">{index + 1}</span>{labelForLandmark(landmark)}{index === 0 && <span className="ml-auto text-xs font-semibold text-muted-foreground">Your pickup</span>}</div>)}</div></section><section className="soft-card p-5 md:p-7"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Riders</p><h2 className="mt-1 font-display text-2xl">{data.members.length} people in this group</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary"><Users size={20} /></span></div><div className="mt-6 grid gap-3">{data.members.map((member) => <MemberRow key={member.id} member={member} group={data} rating={ratings[member.id] ?? 0} onRate={(value) => { setRatings({ ...ratings, [member.id]: value }); rate.mutate({ groupId: data.id, data: { studentId: member.id, rating: value } }, { onSuccess: refresh }); }} onNoShow={() => { if (window.confirm(`Flag ${member.name} as a no-show?`)) noShow.mutate({ groupId: data.id, data: { studentId: member.id } }, { onSuccess: refresh }); }} />)}</div></section></div><aside className="grid content-start gap-6"><section className="soft-card p-6"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-muted-foreground">Fare & vehicle</p><div className="mt-5 flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Your share</p><p className="mt-1 font-display text-4xl">₹{data.farePerHead}</p></div><Badge tone="warm">{data.vehicleType === 'auto' ? 'Auto' : 'Cab'}</Badge></div><div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground"><div className="flex justify-between"><span>Total fare</span><span className="font-bold text-foreground">₹{data.totalFare}</span></div><div className="mt-2 flex justify-between"><span>Split between</span><span className="font-bold text-foreground">{data.memberCount} riders</span></div></div></section>{data.reminderVisible && <div className="rounded-2xl border border-accent/60 bg-accent/20 p-5" data-testid="payment-reminder"><div className="flex gap-3"><WalletCards size={20} className="mt-0.5 text-primary" /><div><h3 className="font-bold">Remember the fare</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">This ride is complete. Settle ₹{data.farePerHead} with your driver when you can.</p></div></div></div>}{data.status === RideGroupStatus.upcoming && <Button onClick={() => { if (window.confirm('Mark this ride as completed?')) complete.mutate({ groupId: data.id }, { onSuccess: refresh }); }} disabled={complete.isPending} className="w-full" testId="button-complete-group">{complete.isPending ? 'Updating ride…' : 'Mark ride completed'} <Check size={17} /></Button>}</aside></div></div>;
}

function LegacyMemberRow({ member, group, rating, onRate, onNoShow }: { member: RideGroupDetails['members'][number]; group: RideGroupDetails; rating: number; onRate: (value: number) => void; onNoShow: () => void }) {
  const current = useGetCurrentStudent();
  const isSelf = current.data?.id === member.id;
  if (isSelf) onNoShow = () => undefined;
  const [ratingOpen, setRatingOpen] = useState(false);
  return <div className="flex flex-col gap-3 rounded-2xl bg-muted/55 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-member-${member.id}`}><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-xs font-bold text-primary">{initials(member.name)}</span><div><p className="text-sm font-bold">{member.name}</p><p className="text-xs text-muted-foreground">{member.studentId} · {labelForLandmark(member.landmark)}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className="text-xs text-muted-foreground"><Star size={13} className="mr-1 inline fill-accent text-accent" />{member.ratingAverage.toFixed(1)}</span>{group.status === RideGroupStatus.completed && <>{ratingOpen ? <div className="flex items-center gap-0.5 rounded-lg bg-card px-1 py-1">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => { onRate(value); setRatingOpen(false); }} className={`rounded-md p-1 ${value <= (rating || 0) ? 'text-accent' : 'text-muted-foreground/35'}`} data-testid={`button-rate-${member.id}-${value}`}><Star size={15} fill="currentColor" /></button>)}</div> : <Button variant="secondary" onClick={() => setRatingOpen(true)} testId={`button-open-rate-${member.id}`}><Star size={14} />{rating ? 'Rated' : 'Rate'}</Button>}</>}{group.status === RideGroupStatus.upcoming && <Button variant="danger" onClick={onNoShow} testId={`button-no-show-${member.id}`}><Flag size={14} />No-show</Button>}</div></div>;
}

function MemberRow({ member, group, rating, onRate, onNoShow }: { member: RideGroupDetails['members'][number]; group: RideGroupDetails; rating: number; onRate: (value: number) => void; onNoShow: () => void }) {
  const current = useGetCurrentStudent();
  const qc = useQueryClient();
  const nudge = useNudgeFarePayer();
  const isSelf = current.data?.id === member.id;
  const [ratingOpen, setRatingOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/55 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-member-${member.id}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-xs font-bold text-primary">{initials(member.name)}</span>
        <div>
          <p className="text-sm font-bold">{member.name} {isSelf && <span className="ml-1 text-xs font-semibold text-muted-foreground">(You)</span>}</p>
          <p className="text-xs text-muted-foreground">{member.studentId} · {labelForLandmark(member.landmark)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="text-xs text-muted-foreground"><Star size={13} className="mr-1 inline fill-accent text-accent" />{member.ratingAverage.toFixed(1)}</span>
        {group.status === RideGroupStatus.completed && !isSelf && member.upiPaymentLink && <a href={member.upiPaymentLink} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-3 text-xs font-bold text-primary hover:brightness-105" data-testid={`link-pay-upi-${member.id}`}><WalletCards size={14} />Pay ₹{group.farePerHead} via UPI</a>}
        {group.status === RideGroupStatus.completed && !isSelf && <Button variant="secondary" disabled={nudge.isPending || !!member.fareNudgeSentAt} onClick={() => nudge.mutate({ groupId: group.id, data: { studentId: member.id } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRideGroupQueryKey(group.id) }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } })} testId={`button-nudge-${member.id}`}><WalletCards size={14} />{member.fareNudgeSentAt ? 'Nudged' : 'Nudge'}</Button>}
        {group.status === RideGroupStatus.completed && <>{ratingOpen ? <div className="flex items-center gap-0.5 rounded-lg bg-card px-1 py-1">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => { onRate(value); setRatingOpen(false); }} className={`rounded-md p-1 ${value <= (rating || 0) ? 'text-accent' : 'text-muted-foreground/35'}`} data-testid={`button-rate-${member.id}-${value}`}><Star size={15} fill="currentColor" /></button>)}</div> : <Button variant="secondary" onClick={() => setRatingOpen(true)} testId={`button-open-rate-${member.id}`}><Star size={14} />{rating ? 'Rated' : 'Rate'}</Button>}</>}
        {group.status === RideGroupStatus.upcoming && !isSelf && <Button variant="danger" onClick={onNoShow} testId={`button-no-show-${member.id}`}><Flag size={14} />No-show</Button>}
      </div>
    </div>
  );
}

function LegacyEditRequestPage() {
  const params = useParams<{ id: string }>(); const id = Number(params.id); const [, setLocation] = useLocation(); const qc = useQueryClient();
  const request = useGetRideRequest(id, { query: { enabled: !!id, queryKey: getGetRideRequestQueryKey(id) } }); const update = useUpdateRideRequest(); const cancel = useCancelRideRequest();
  const [form, setForm] = useState<RideRequestUpdate | null>(null);
  if (request.isLoading) return <LoadingState lines={1} />;
  if (request.isError || !request.data) return <ErrorState onRetry={() => request.refetch()} message="This ride request is no longer available." />;
  const data = form ?? { date: request.data.date, timeSlot: request.data.timeSlot, landmark: request.data.landmark, coRiderPreference: request.data.coRiderPreference };
  const set = <K extends keyof RideRequestUpdate>(key: K, value: RideRequestUpdate[K]) => setForm({ ...data, [key]: value });
  return <div className="page-enter mx-auto max-w-3xl"><Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground" data-testid="link-back-edit"><ArrowLeft size={16} />Back to today</Link><PageHeading eyebrow="Edit request" title="Keep the plan tidy." copy="Changes are shared with matching in the background." /><form className="soft-card grid gap-6 p-5 md:p-7" onSubmit={(event) => { event.preventDefault(); update.mutate({ requestId: id, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRideRequestQueryKey(id) }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() }); setLocation('/'); } }); }}><div className="grid gap-5 md:grid-cols-2"><Field label="Travel date"><TextInput type="date" min={new Date().toISOString().slice(0, 10)} value={data.date} onChange={(event) => set('date', event.target.value)} required testId="input-edit-date" /></Field><Field label="Time slot"><SelectInput value={data.timeSlot} onChange={(event) => set('timeSlot', event.target.value as typeof TimeSlot[keyof typeof TimeSlot])} testId="select-edit-time">{slots.map((slot) => <option value={slot.value} key={slot.value}>{slot.label}</option>)}</SelectInput></Field></div><div><p className="mb-2 text-sm font-semibold">Pickup landmark</p><div className="grid gap-2 sm:grid-cols-2">{landmarks.map((item, index) => <OptionCard key={item.value} number={index + 1} title={item.label} note={item.note} selected={data.landmark === item.value} onClick={() => set('landmark', item.value)} testId={`option-edit-landmark-${item.value}`} />)}</div></div><div><p className="mb-2 text-sm font-semibold">Co-rider preference</p><div className="grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Any co-rider" selected={data.coRiderPreference === CoRiderPreference.any} onClick={() => set('coRiderPreference', CoRiderPreference.any)} testId="option-edit-any" /><OptionCard number={2} title="Same-gender only" selected={data.coRiderPreference === CoRiderPreference['same-gender-only']} onClick={() => set('coRiderPreference', CoRiderPreference['same-gender-only'])} testId="option-edit-same-gender" /></div></div>{update.isError && <p className="text-sm text-destructive" data-testid="status-edit-error">We could not save those changes.</p>}<div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row"><Button variant="danger" onClick={() => { if (window.confirm('Cancel this ride request?')) cancel.mutate({ requestId: id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() }); setLocation('/'); } }); }} disabled={cancel.isPending} testId="button-cancel-ride">{cancel.isPending ? 'Cancelling…' : 'Cancel request'}</Button><Button type="submit" disabled={update.isPending} testId="button-save-edit">{update.isPending ? 'Saving…' : 'Save changes'} <Check size={17} /></Button></div></form></div>;
}

function EditRequestPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const now = useKolkataClock();
  const request = useGetRideRequest(id, { query: { enabled: !!id, queryKey: getGetRideRequestQueryKey(id) } });
  const update = useUpdateRideRequest();
  const cancel = useCancelRideRequest();
  const [form, setForm] = useState<RideRequestUpdate | null>(null);

  if (request.isLoading) return <LoadingState lines={1} />;
  if (request.isError || !request.data) return <ErrorState onRetry={() => request.refetch()} message="This ride request is no longer available." />;
  const data = form ?? { date: request.data.date, timeSlot: request.data.timeSlot, landmark: request.data.landmark, coRiderPreference: request.data.coRiderPreference };
  const set = <K extends keyof RideRequestUpdate>(key: K, value: RideRequestUpdate[K]) => setForm({ ...data, [key]: value });
  const timeAvailable = isRideTimeAvailable(data.date, data.timeSlot, now);

  return <div className="page-enter mx-auto max-w-3xl"><Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground" data-testid="link-back-edit"><ArrowLeft size={16} />Back to today</Link><PageHeading eyebrow="Edit request" title="Keep the plan tidy." copy="Changes are shared with matching in the background." /><form className="soft-card grid gap-6 p-5 md:p-7" onSubmit={(event) => { event.preventDefault(); update.mutate({ requestId: id, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRideRequestQueryKey(id) }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() }); setLocation('/'); } }); }}><div className="grid gap-5 md:grid-cols-2"><Field label="Travel date"><TextInput type="date" min={kolkataDateTime(now).date} value={data.date} onChange={(event) => set('date', event.target.value)} required testId="input-edit-date" /></Field><Field label="Time slot"><SelectInput value={data.timeSlot} onChange={(event) => set('timeSlot', event.target.value as typeof TimeSlot[keyof typeof TimeSlot])} testId="select-edit-time">{slots.map((slot) => <option value={slot.value} key={slot.value} disabled={!isRideTimeAvailable(data.date, slot.value, now)}>{slot.label}{!isRideTimeAvailable(data.date, slot.value, now) ? ' (past)' : ''}</option>)}</SelectInput></Field></div><div><p className="mb-2 text-sm font-semibold">Pickup landmark</p><div className="grid gap-2 sm:grid-cols-2">{landmarks.map((item, index) => <OptionCard key={item.value} number={index + 1} title={item.label} note={item.note} selected={data.landmark === item.value} onClick={() => set('landmark', item.value)} testId={`option-edit-landmark-${item.value}`} />)}</div></div><div><p className="mb-2 text-sm font-semibold">Co-rider preference</p><div className="grid gap-2 sm:grid-cols-2"><OptionCard number={1} title="Any co-rider" selected={data.coRiderPreference === CoRiderPreference.any} onClick={() => set('coRiderPreference', CoRiderPreference.any)} testId="option-edit-any" /><OptionCard number={2} title="Same-gender only" selected={data.coRiderPreference === CoRiderPreference['same-gender-only']} onClick={() => set('coRiderPreference', CoRiderPreference['same-gender-only'])} testId="option-edit-same-gender" /></div></div>{update.isError && <p className="text-sm text-destructive" data-testid="status-edit-error">That ride time has already passed. Choose a future date and time.</p>}<div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row"><Button variant="danger" onClick={() => { if (window.confirm('Cancel this ride request?')) cancel.mutate({ requestId: id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetRideRequestsQueryKey() }); setLocation('/'); } }); }} disabled={cancel.isPending} testId="button-cancel-ride">{cancel.isPending ? 'Cancelling…' : 'Cancel request'}</Button><Button type="submit" disabled={update.isPending || !timeAvailable} testId="button-save-edit">{update.isPending ? 'Saving…' : 'Save changes'} <Check size={17} /></Button></div></form></div>;
}

function Router() {
  const [location] = useLocation();
  const isAuth = location === '/login' || location === '/register';
  return <ErrorBoundary resetKey={location}>{isAuth ? <Switch><Route path="/login" component={LoginPage} /><Route path="/register" component={RegisterPage} /></Switch> : <ProtectedRoutes />}</ErrorBoundary>;
}

function NotFoundPage() {
  return <div className="grid min-h-[65vh] place-items-center text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><Compass size={29} /></div><h1 className="mt-5 font-display text-4xl">This path is off campus.</h1><p className="mt-2 text-sm text-muted-foreground">The page you are looking for does not exist.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-not-found-home"><Home size={16} />Back to today</Link></div></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;