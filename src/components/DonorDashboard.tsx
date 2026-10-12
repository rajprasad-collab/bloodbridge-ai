
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
    Activity,
    CalendarDays,
    CheckCircle2,
    Clock,
    Droplets,
    MapPin,
    RefreshCw,
    Save,
    UserRound,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type DonorForm = {
    full_name: string;
    blood_group: string;
    date_of_birth: string;
    phone: string;
    city: string;
    address: string;
    last_donation_date: string;
};

type BloodRequest = {
    id: number;
    recipient_blood_group: string;
    component: string;
    units_required: number;
    priority: string;
    status: string;
    required_by: string | null;
    created_at: string;
    hospitals:
    | { name: string; city: string | null }
    | { name: string; city: string | null }[]
    | null;
};

const emptyForm: DonorForm = {
    full_name: "",
    blood_group: "",
    date_of_birth: "",
    phone: "",
    city: "",
    address: "",
    last_donation_date: "",
};

function hospitalDetails(
    hospital: BloodRequest["hospitals"]
): { name: string; city: string | null } | null {
    if (Array.isArray(hospital)) return hospital[0] ?? null;
    return hospital;
}

function pretty(value: string) {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export default function DonorDashboard() {
    const [form, setForm] = useState<DonorForm>(emptyForm);
    const [requests, setRequests] = useState<BloodRequest[]>([]);
    const [userId, setUserId] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const { data: authData, error: authError } =
                await supabase.auth.getUser();

            if (authError) throw authError;
            const user = authData.user;

            if (!user) {
                throw new Error("Your session has expired. Please sign in again.");
            }

            setUserId(user.id);
            setEmail(user.email ?? "");

            const [
                { data: profile, error: profileError },
                { data: donor, error: donorError },
                { data: openRequests, error: requestError },
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("full_name, email")
                    .eq("id", user.id)
                    .maybeSingle(),

                supabase
                    .from("donors")
                    .select(
                        "blood_group, date_of_birth, phone, city, address, last_donation_date"
                    )
                    .eq("user_id", user.id)
                    .maybeSingle(),

                supabase
                    .from("blood_requests")
                    .select(
                        "id, recipient_blood_group, component, units_required, priority, status, required_by, created_at, hospitals(name, city)"
                    )
                    .in("status", ["created", "searching", "match_found"])
                    .order("created_at", { ascending: false }),
            ]);

            if (profileError) throw profileError;
            if (donorError) throw donorError;
            if (requestError) throw requestError;

            setForm({
                ...emptyForm,
                full_name: profile?.full_name ?? "",
                blood_group: donor?.blood_group ?? "",
                date_of_birth: donor?.date_of_birth ?? "",
                phone: donor?.phone ?? "",
                city: donor?.city ?? "",
                address: donor?.address ?? "",
                last_donation_date: donor?.last_donation_date ?? "",
            });

            setRequests((openRequests ?? []) as BloodRequest[]);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load donor dashboard."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDashboard();

        const channel = supabase
            .channel("donor-blood-request-updates")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "blood_requests",
                },
                () => {
                    void loadDashboard();
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [loadDashboard]);

    function updateField(field: keyof DonorForm, value: string) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccess("");
    }

    async function saveProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!userId) {
            setError("Please sign in again before saving your profile.");
            return;
        }

        if (!form.full_name.trim() || !form.blood_group) {
            setError("Please enter your name and select your blood group.");
            return;
        }

        setSaving(true);

        try {
            const { error: profileError } = await supabase
                .from("profiles")
                .update({ full_name: form.full_name.trim() })
                .eq("id", userId);

            if (profileError) throw profileError;

            const { error: donorError } = await supabase
                .from("donors")
                .upsert(
                    {
                        user_id: userId,
                        blood_group: form.blood_group,
                        date_of_birth: form.date_of_birth || null,
                        phone: form.phone.trim() || null,
                        city: form.city.trim() || null,
                        address: form.address.trim() || null,
                        last_donation_date: form.last_donation_date || null,
                    },
                    { onConflict: "user_id" }
                );

            if (donorError) throw donorError;

            setSuccess("Your donor information has been saved successfully.");
            await loadDashboard();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to save your donor information."
            );
        } finally {
            setSaving(false);
        }
    }

    const profileComplete = Boolean(
        form.full_name.trim() &&
        form.blood_group &&
        form.phone.trim() &&
        form.city.trim()
    );

    if (loading) {
        return (
            <section className="donor-dashboard">
                <p>Loading your donor dashboard...</p>
            </section>
        );
    }

    return (
        <section className="donor-dashboard">
            <div className="donor-dashboard-heading">
                <div>
                    <p className="donor-dashboard-eyebrow">BLOODBRIDGE AI · DONOR PORTAL</p>
                    <h1>Donor Dashboard</h1>
                    <p>Manage your donor information and view current blood requests.</p>
                </div>

                <button
                    className="donor-dashboard-refresh"
                    type="button"
                    onClick={() => void loadDashboard()}
                >
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {error && <div className="donor-dashboard-error">{error}</div>}
            {success && <div className="donor-dashboard-success">{success}</div>}

            <div className="donor-dashboard-stats">
                <article className="donor-dashboard-stat">
                    <UserRound size={22} />
                    <span>Profile status</span>
                    <strong>{profileComplete ? "Complete basics" : "Needs details"}</strong>
                </article>

                <article className="donor-dashboard-stat">
                    <Droplets size={22} />
                    <span>Your blood group</span>
                    <strong>{form.blood_group || "Not provided"}</strong>
                </article>

                <article className="donor-dashboard-stat">
                    <Activity size={22} />
                    <span>Open blood requests</span>
                    <strong>{requests.length}</strong>
                </article>
            </div>

            <div className="donor-dashboard-grid">
                <section className="donor-dashboard-panel">
                    <div className="donor-dashboard-panel-heading">
                        <UserRound size={20} />
                        <div>
                            <h2>My Donor Information</h2>
                            <p>Update the details used by the blood bank team.</p>
                        </div>
                    </div>

                    <form className="donor-dashboard-form" onSubmit={saveProfile}>
                        <label>
                            Full name *
                            <input
                                value={form.full_name}
                                onChange={(e) => updateField("full_name", e.target.value)}
                                required
                                maxLength={120}
                                autoComplete="name"
                            />
                        </label>

                        <label>
                            Email address
                            <input value={email} readOnly />
                        </label>

                        <label>
                            Blood group *
                            <select
                                value={form.blood_group}
                                onChange={(e) => updateField("blood_group", e.target.value)}
                                required
                            >
                                <option value="">Select blood group</option>
                                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                                    (group) => (
                                        <option key={group} value={group}>
                                            {group}
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label>
                            Date of birth
                            <input
                                type="date"
                                value={form.date_of_birth}
                                onChange={(e) => updateField("date_of_birth", e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                            />
                        </label>

                        <label>
                            Phone number
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(e) => updateField("phone", e.target.value)}
                                maxLength={25}
                                autoComplete="tel"
                                placeholder="Enter contact number"
                            />
                        </label>

                        <label>
                            City
                            <input
                                value={form.city}
                                onChange={(e) => updateField("city", e.target.value)}
                                maxLength={100}
                                autoComplete="address-level2"
                                placeholder="Enter your city"
                            />
                        </label>

                        <label className="donor-dashboard-full-width">
                            Address
                            <textarea
                                value={form.address}
                                onChange={(e) => updateField("address", e.target.value)}
                                rows={3}
                                maxLength={500}
                                autoComplete="street-address"
                                placeholder="Enter your address"
                            />
                        </label>

                        <label className="donor-dashboard-full-width">
                            Last blood donation date, if applicable
                            <input
                                type="date"
                                value={form.last_donation_date}
                                onChange={(e) =>
                                    updateField("last_donation_date", e.target.value)
                                }
                                max={new Date().toISOString().slice(0, 10)}
                            />
                        </label>

                        <p className="donor-dashboard-hint">
                            Enter accurate information. This profile does not establish
                            medical eligibility to donate; the blood bank must confirm that.
                        </p>

                        <button
                            className="donor-dashboard-save"
                            type="submit"
                            disabled={saving}
                        >
                            <Save size={17} />
                            {saving ? "Saving..." : "Save My Information"}
                        </button>
                    </form>
                </section>

                <section className="donor-dashboard-panel">
                    <div className="donor-dashboard-panel-heading">
                        <Droplets size={20} />
                        <div>
                            <h2>Current Blood Requests</h2>
                            <p>Requests published by hospitals and the blood bank team.</p>
                        </div>
                    </div>

                    {requests.length === 0 ? (
                        <div className="donor-dashboard-empty">
                            <CheckCircle2 size={28} />
                            <strong>No open requests right now</strong>
                            <p>Refresh later to check for new requests.</p>
                        </div>
                    ) : (
                        <div className="donor-dashboard-request-list">
                            {requests.map((request) => {
                                const hospital = hospitalDetails(request.hospitals);

                                return (
                                    <article
                                        className="donor-dashboard-request"
                                        key={request.id}
                                    >
                                        <div className="donor-dashboard-request-top">
                                            <span className="donor-dashboard-blood-group">
                                                {request.recipient_blood_group}
                                            </span>
                                            <span
                                                className={`donor-dashboard-priority priority-${request.priority}`}
                                            >
                                                {pretty(request.priority)}
                                            </span>
                                        </div>

                                        <h3>Request #{request.id}</h3>
                                        <p>{pretty(request.component)}</p>

                                        <div className="donor-dashboard-request-detail">
                                            <Droplets size={15} />
                                            {request.units_required} unit(s) required
                                        </div>

                                        <div className="donor-dashboard-request-detail">
                                            <MapPin size={15} />
                                            {hospital?.name ?? "Hospital details unavailable"}
                                            {hospital?.city ? ` · ${hospital.city}` : ""}
                                        </div>

                                        <div className="donor-dashboard-request-detail">
                                            <Clock size={15} />
                                            Status: {pretty(request.status)}
                                        </div>

                                        {request.required_by && (
                                            <div className="donor-dashboard-request-detail">
                                                <CalendarDays size={15} />
                                                Required by: {request.required_by}
                                            </div>
                                        )}

                                        <p className="donor-dashboard-request-note">
                                            Contact the blood bank team to ask about safe and
                                            appropriate ways to help. Do not treat this listing as
                                            confirmation that you are eligible to donate.
                                        </p>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}
