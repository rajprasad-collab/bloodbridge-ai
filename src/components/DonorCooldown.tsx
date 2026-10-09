
import { useCallback, useEffect, useState } from "react";
import {
    RefreshCw,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Activity,
    Search,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const COOLDOWN_DAYS = 56; // 8-week standard whole-blood recovery

type Profile = {
    id: string;
    full_name: string;
};

type Donor = {
    id: string;
    user_id: string;
    blood_group: string;
    last_donation_date: string | null;
};

type Donation = {
    id: string;
    donor_id: string;
    donation_date: string;
    status: string;
};

type DonorStatus = {
    donor: Donor;
    profile: Profile | undefined;
    lastDonationDate: string | null;
    daysSince: number | null;
    daysRemaining: number;
    isEligible: boolean;
    isAlmost: boolean;
    progress: number; // 0–100
};

type FilterMode = "all" | "eligible" | "almost" | "cooldown";

const bloodGroupColors: Record<string, string> = {
    "A+": "#dc2626",
    "A-": "#b91c1c",
    "B+": "#7c3aed",
    "B-": "#6d28d9",
    "AB+": "#0ea5e9",
    "AB-": "#0284c7",
    "O+": "#059669",
    "O-": "#047857",
};

function daysBetween(dateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const past = new Date(dateStr);
    past.setHours(0, 0, 0, 0);
    return Math.floor(
        (today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)
    );
}

/* ── Circular progress ring ─────────────────────────────────────── */
function CooldownRing({
    progress,
    isEligible,
    isAlmost,
}: {
    progress: number;
    isEligible: boolean;
    isAlmost: boolean;
}) {
    const radius = 34;
    const stroke = 5;
    const r = radius - stroke / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (progress / 100) * circ;

    const color = isEligible ? "#059669" : isAlmost ? "#d97706" : "#dc2626";
    const track = isEligible ? "#d1fae5" : isAlmost ? "#fef3c7" : "#fee2e2";

    return (
        <svg
            width={radius * 2}
            height={radius * 2}
            className="cooldown-ring-svg"
            aria-hidden="true"
        >
            {/* track */}
            <circle
                cx={radius}
                cy={radius}
                r={r}
                fill="none"
                stroke={track}
                strokeWidth={stroke}
            />
            {/* progress arc */}
            <circle
                cx={radius}
                cy={radius}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${radius} ${radius})`}
                className="cooldown-ring-progress"
            />
            {/* centre label */}
            <text
                x={radius}
                y={radius + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontSize="11"
                fontWeight="800"
            >
                {isEligible ? "✓" : `${Math.round(progress)}%`}
            </text>
        </svg>
    );
}

/* ── Individual donor card ──────────────────────────────────────── */
function DonorCard({ status }: { status: DonorStatus }) {
    const {
        donor,
        profile,
        lastDonationDate,
        daysSince,
        daysRemaining,
        isEligible,
        isAlmost,
        progress,
    } = status;
    const bgColor = bloodGroupColors[donor.blood_group] ?? "#dc2626";

    const cardClass = [
        "cooldown-card",
        isEligible
            ? "cooldown-card-eligible"
            : isAlmost
                ? "cooldown-card-almost"
                : "cooldown-card-cooldown",
    ].join(" ");

    return (
        <article className={cardClass}>
            <div className="cooldown-card-top">
                <div
                    className="cooldown-blood-badge"
                    style={{ background: bgColor }}
                    aria-label={`Blood group ${donor.blood_group}`}
                >
                    {donor.blood_group}
                </div>

                <div className="cooldown-card-info">
                    <strong>{profile?.full_name ?? "Donor"}</strong>
                    <span>
                        {isEligible
                            ? "Ready to donate"
                            : isAlmost
                                ? `${daysRemaining}d until eligible`
                                : `${daysRemaining} days remaining`}
                    </span>
                </div>

                <CooldownRing
                    progress={progress}
                    isEligible={isEligible}
                    isAlmost={isAlmost}
                />
            </div>

            <div className="cooldown-card-meta">
                <div className="cooldown-meta-row">
                    <span>Last donated</span>
                    <strong>
                        {lastDonationDate
                            ? new Date(lastDonationDate).toLocaleDateString(
                                "en-IN",
                                {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                }
                            )
                            : "Never"}
                    </strong>
                </div>

                <div className="cooldown-meta-row">
                    <span>Days since donation</span>
                    <strong>
                        {daysSince !== null ? `${daysSince} days` : "—"}
                    </strong>
                </div>

                <div className="cooldown-meta-row">
                    <span>Cooldown progress</span>
                    <strong>
                        {daysSince !== null
                            ? `${Math.min(daysSince, COOLDOWN_DAYS)} / ${COOLDOWN_DAYS} days`
                            : "—"}
                    </strong>
                </div>

                <div className="cooldown-meta-row cooldown-meta-status">
                    <span>Status</span>
                    <span
                        className={`cooldown-status-pill ${isEligible
                                ? "pill-eligible"
                                : isAlmost
                                    ? "pill-almost"
                                    : "pill-cooldown"
                            }`}
                    >
                        {isEligible
                            ? "✓ Eligible"
                            : isAlmost
                                ? "⏰ Almost ready"
                                : "⏳ In cooldown"}
                    </span>
                </div>
            </div>
        </article>
    );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function DonorCooldown() {
    const [donors, setDonors] = useState<Donor[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [donations, setDonations] = useState<Donation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<FilterMode>("all");
    const [search, setSearch] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [donorRes, profileRes, donationRes] = await Promise.all([
                supabase
                    .from("donors")
                    .select("id, user_id, blood_group, last_donation_date")
                    .order("id"),

                supabase
                    .from("profiles")
                    .select("id, full_name")
                    .eq("role", "donor")
                    .eq("is_active", true),

                supabase
                    .from("donations")
                    .select("id, donor_id, donation_date, status")
                    .order("donation_date", { ascending: false }),
            ]);

            if (donorRes.error) throw donorRes.error;
            if (profileRes.error) throw profileRes.error;
            if (donationRes.error) throw donationRes.error;

            setDonors((donorRes.data ?? []) as Donor[]);
            setProfiles((profileRes.data ?? []) as Profile[]);
            setDonations((donationRes.data ?? []) as Donation[]);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not load cooldown data."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const statuses: DonorStatus[] = donors.map((donor) => {
        const donorDonations = donations
            .filter((d) => d.donor_id === donor.id && d.status !== "rejected")
            .sort((a, b) => b.donation_date.localeCompare(a.donation_date));

        const lastDate =
            donorDonations[0]?.donation_date ?? donor.last_donation_date;
        const daysSince = lastDate ? daysBetween(lastDate) : null;
        const daysRemaining =
            daysSince !== null ? Math.max(0, COOLDOWN_DAYS - daysSince) : 0;
        const isEligible =
            daysSince === null || daysSince >= COOLDOWN_DAYS;
        const isAlmost = !isEligible && daysRemaining <= 7;
        const progress =
            daysSince !== null
                ? Math.min(100, (daysSince / COOLDOWN_DAYS) * 100)
                : 100;

        return {
            donor,
            profile: profileById.get(donor.user_id),
            lastDonationDate: lastDate,
            daysSince,
            daysRemaining,
            isEligible,
            isAlmost,
            progress,
        };
    });

    const eligibleCount = statuses.filter((s) => s.isEligible).length;
    const almostCount = statuses.filter((s) => s.isAlmost).length;
    const cooldownCount = statuses.filter(
        (s) => !s.isEligible && !s.isAlmost
    ).length;

    const filtered = statuses.filter((s) => {
        const name = (s.profile?.full_name ?? "").toLowerCase();
        const group = s.donor.blood_group.toLowerCase();
        const q = search.toLowerCase();
        if (q && !name.includes(q) && !group.includes(q)) return false;
        if (filter === "eligible") return s.isEligible;
        if (filter === "almost") return s.isAlmost;
        if (filter === "cooldown") return !s.isEligible;
        return true;
    });

    const filterLabels: Record<FilterMode, string> = {
        all: "All donors",
        eligible: "✅ Eligible now",
        almost: "⏰ Almost ready",
        cooldown: "⏳ In cooldown",
    };

    return (
        <section className="cooldown-module">
            {/* Header */}
            <div className="cooldown-heading">
                <div>
                    <span className="cooldown-eyebrow">
                        DONOR ELIGIBILITY TRACKER
                    </span>
                    <h2>Donation Cooldown Monitor</h2>
                    <p>
                        Live 56-day recovery tracking for every registered
                        donor.
                    </p>
                </div>

                <button
                    type="button"
                    className="cooldown-refresh"
                    onClick={() => void loadData()}
                    disabled={loading}
                >
                    <RefreshCw size={15} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="cooldown-error" role="alert">
                    {error}
                </div>
            )}

            {/* Stats */}
            <div className="cooldown-stats">
                <div className="cooldown-stat cooldown-stat-total">
                    <Activity size={20} />
                    <span>Total donors</span>
                    <strong>{donors.length}</strong>
                </div>
                <div className="cooldown-stat cooldown-stat-eligible">
                    <CheckCircle2 size={20} />
                    <span>Eligible now</span>
                    <strong>{eligibleCount}</strong>
                </div>
                <div className="cooldown-stat cooldown-stat-almost">
                    <AlertTriangle size={20} />
                    <span>Almost ready</span>
                    <strong>{almostCount}</strong>
                </div>
                <div className="cooldown-stat cooldown-stat-cooldown">
                    <Clock size={20} />
                    <span>In cooldown</span>
                    <strong>{cooldownCount}</strong>
                </div>
            </div>

            {/* Controls */}
            <div className="cooldown-controls">
                <div className="cooldown-filter-tabs" role="group" aria-label="Filter donors">
                    {(
                        [
                            "all",
                            "eligible",
                            "almost",
                            "cooldown",
                        ] as FilterMode[]
                    ).map((f) => (
                        <button
                            key={f}
                            type="button"
                            className={`cooldown-tab ${filter === f ? "cooldown-tab-active" : ""}`}
                            onClick={() => setFilter(f)}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>

                <div className="cooldown-search">
                    <Search size={14} />
                    <input
                        type="search"
                        placeholder="Search by name or blood group…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search donors"
                    />
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="cooldown-loading">
                    <div className="cooldown-spinner" />
                    Loading donor eligibility data…
                </div>
            ) : filtered.length === 0 ? (
                <div className="cooldown-empty">
                    No donors match your current filter.
                </div>
            ) : (
                <div className="cooldown-grid">
                    {filtered.map((s) => (
                        <DonorCard key={s.donor.id} status={s} />
                    ))}
                </div>
            )}

            <p className="cooldown-disclaimer">
                The 56-day (8-week) window is a standard guideline for
                whole-blood donation recovery. Clinical eligibility must be
                confirmed by qualified personnel before any donation proceeds.
            </p>
        </section>
    );
}
