
import { useEffect, useState } from "react";
import {
    Users,
    Plus,
    Droplet,
    RefreshCw,
    ClipboardList,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Profile = {
    id: string;
    full_name: string;
    email: string;
    role: string;
};

type Donor = {
    id: string;
    user_id: string;
    blood_group: string;
    date_of_birth: string | null;
    last_donation_date: string | null;
};

type BloodBank = {
    id: string;
    name: string;
};

type Donation = {
    id: string;
    donor_id: string;
    blood_bank_id: string;
    donation_date: string;
    quantity_ml: number;
    status: string;
};

const bloodGroups = [
    "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
];

export default function DonorManagement() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [donors, setDonors] = useState<Donor[]>([]);
    const [banks, setBanks] = useState<BloodBank[]>([]);
    const [donations, setDonations] = useState<Donation[]>([]);

    const [selectedProfile, setSelectedProfile] = useState("");
    const [bloodGroup, setBloodGroup] = useState("O+");
    const [dateOfBirth, setDateOfBirth] = useState("");

    const [donorId, setDonorId] = useState("");
    const [bankId, setBankId] = useState("");
    const [donationDate, setDonationDate] = useState(
        new Date().toLocaleDateString("en-CA")
    );
    const [quantity, setQuantity] = useState("450");
    const [donationStatus, setDonationStatus] = useState("recorded");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [search, setSearch] = useState("");

    async function loadData() {
        setLoading(true);
        setError("");

        try {
            const [
                profileResult,
                donorResult,
                bankResult,
                donationResult,
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, full_name, email, role")
                    .eq("role", "donor")
                    .eq("is_active", true)
                    .order("full_name"),

                supabase
                    .from("donors")
                    .select(
                        "id, user_id, blood_group, date_of_birth, last_donation_date"
                    )
                    .order("id"),

                supabase
                    .from("blood_banks")
                    .select("id, name")
                    .eq("is_active", true)
                    .order("name"),

                supabase
                    .from("donations")
                    .select(
                        "id, donor_id, blood_bank_id, donation_date, quantity_ml, status"
                    )
                    .order("donation_date", { ascending: false }),
            ]);

            if (profileResult.error) throw profileResult.error;
            if (donorResult.error) throw donorResult.error;
            if (bankResult.error) throw bankResult.error;
            if (donationResult.error) throw donationResult.error;

            setProfiles((profileResult.data ?? []) as Profile[]);
            setDonors((donorResult.data ?? []) as Donor[]);
            setBanks((bankResult.data ?? []) as BloodBank[]);
            setDonations((donationResult.data ?? []) as Donation[]);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not load donor information."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadData();
    }, []);

    async function registerDonor(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (donors.some((d) => d.user_id === selectedProfile)) {
                throw new Error("This user is already registered as a donor.");
            }

            const { error: insertError } = await supabase
                .from("donors")
                .insert({
                    user_id: selectedProfile,
                    blood_group: bloodGroup,
                    date_of_birth: dateOfBirth || null,
                });

            if (insertError) throw insertError;

            setSuccess("Donor registered successfully.");
            setSelectedProfile("");
            setDateOfBirth("");
            await loadData();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not register donor."
            );
        } finally {
            setSaving(false);
        }
    }

    async function recordDonation(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (!donorId || !bankId) {
                throw new Error("Select both a donor and a blood bank.");
            }

            const amount = Number(quantity);

            if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error("Enter a valid donation quantity.");
            }

            const { error: insertError } = await supabase
                .from("donations")
                .insert({
                    donor_id: donorId,
                    blood_bank_id: bankId,
                    donation_date: donationDate,
                    quantity_ml: amount,
                    status: donationStatus,
                });

            if (insertError) throw insertError;

            setSuccess(
                donationStatus === "tested"
                    ? "Donation recorded with status 'tested'. Ensure authorized testing documentation is maintained."
                    : "Donation recorded. It has not been added to available inventory."
            );

            setDonorId("");
            setQuantity("450");
            setDonationStatus("recorded");
            await loadData();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not record donation."
            );
        } finally {
            setSaving(false);
        }
    }

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const donorById = new Map(donors.map((d) => [d.id, d]));
    const bankById = new Map(banks.map((b) => [b.id, b]));
    const registeredUserIds = new Set(donors.map((d) => d.user_id));

    const filteredDonors = donors.filter((donor) => {
        const profile = profileById.get(donor.user_id);
        const query = search.toLowerCase();

        return (
            (profile?.full_name ?? "").toLowerCase().includes(query) ||
            (profile?.email ?? "").toLowerCase().includes(query) ||
            donor.blood_group.toLowerCase().includes(query)
        );
    });

    return (
        <section className="donor-module">
            <div className="donor-module-heading">
                <div>
                    <span className="donor-eyebrow">DONOR OPERATIONS</span>
                    <h2>Donor & Donation Management</h2>
                    <p>Maintain donor profiles and donation records.</p>
                </div>

                <button
                    type="button"
                    className="donor-refresh"
                    onClick={() => void loadData()}
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            {error && <div className="donor-message donor-error">{error}</div>}
            {success && (
                <div className="donor-message donor-success" role="status">
                    {success}
                </div>
            )}

            <div className="donor-stat-grid">
                <div className="donor-stat">
                    <Users size={21} />
                    <span>Registered donors</span>
                    <strong>{donors.length}</strong>
                </div>

                <div className="donor-stat">
                    <Droplet size={21} />
                    <span>Donation records</span>
                    <strong>{donations.length}</strong>
                </div>

                <div className="donor-stat">
                    <ClipboardList size={21} />
                    <span>Recorded donations</span>
                    <strong>
                        {donations.filter((d) => d.status === "recorded").length}
                    </strong>
                </div>
            </div>

            <div className="donor-form-grid">
                <form className="donor-panel" onSubmit={registerDonor}>
                    <h3>
                        <Plus size={19} />
                        Register donor
                    </h3>

                    <label htmlFor="donor-profile">Existing donor account</label>
                    <select
                        id="donor-profile"
                        value={selectedProfile}
                        onChange={(e) => setSelectedProfile(e.target.value)}
                        required
                    >
                        <option value="">Select a user</option>
                        {profiles
                            .filter((p) => !registeredUserIds.has(p.id))
                            .map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.full_name} — {p.email}
                                </option>
                            ))}
                    </select>

                    <label htmlFor="donor-blood-group">Blood group</label>
                    <select
                        id="donor-blood-group"
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value)}
                        required
                    >
                        {bloodGroups.map((group) => (
                            <option key={group} value={group}>
                                {group}
                            </option>
                        ))}
                    </select>

                    <label htmlFor="donor-dob">Date of birth (optional)</label>
                    <input
                        id="donor-dob"
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                    />

                    <button type="submit" disabled={saving || !selectedProfile}>
                        {saving ? "Saving..." : "Register donor"}
                    </button>
                </form>

                <form className="donor-panel" onSubmit={recordDonation}>
                    <h3>
                        <Droplet size={19} />
                        Record donation
                    </h3>

                    <label htmlFor="donation-donor">Registered donor</label>
                    <select
                        id="donation-donor"
                        value={donorId}
                        onChange={(e) => setDonorId(e.target.value)}
                        required
                    >
                        <option value="">Select donor</option>
                        {donors.map((d) => {
                            const profile = profileById.get(d.user_id);

                            return (
                                <option key={d.id} value={d.id}>
                                    {profile?.full_name ?? d.user_id} ({d.blood_group})
                                </option>
                            );
                        })}
                    </select>

                    <label htmlFor="donation-bank">Blood bank</label>
                    <select
                        id="donation-bank"
                        value={bankId}
                        onChange={(e) => setBankId(e.target.value)}
                        required
                    >
                        <option value="">Select blood bank</option>
                        {banks.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                                {bank.name}
                            </option>
                        ))}
                    </select>

                    <label htmlFor="donation-date">Donation date</label>
                    <input
                        id="donation-date"
                        type="date"
                        value={donationDate}
                        onChange={(e) => setDonationDate(e.target.value)}
                        required
                    />

                    <label htmlFor="donation-quantity">Quantity (ml)</label>
                    <input
                        id="donation-quantity"
                        type="number"
                        min="1"
                        max="1000"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        required
                    />

                    <label htmlFor="donation-status">Recording status</label>
                    <select
                        id="donation-status"
                        value={donationStatus}
                        onChange={(e) => setDonationStatus(e.target.value)}
                        required
                    >
                        <option value="recorded">Recorded — pending testing</option>
                        <option value="tested">Tested — staff verified</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    <button type="submit" disabled={saving || donors.length === 0 || banks.length === 0}>
                        {saving ? "Saving..." : "Save donation"}
                    </button>
                </form>
            </div>

            <div className="donor-panel donor-table-panel">
                <h3>Registered donors</h3>

                <input
                    type="search"
                    placeholder="Search name, email, or blood group..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search donors"
                />

                {loading ? (
                    <p>Loading donor records...</p>
                ) : (
                    <div className="donor-table-scroll">
                        <table className="donor-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Blood group</th>
                                    <th>Last donation</th>
                                    <th>Donation count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDonors.map((donor) => {
                                    const profile = profileById.get(donor.user_id);
                                    const count = donations.filter(
                                        (d) => d.donor_id === donor.id
                                    ).length;

                                    return (
                                        <tr key={donor.id}>
                                            <td>{profile?.full_name ?? "Unknown user"}</td>
                                            <td>{profile?.email ?? "—"}</td>
                                            <td>
                                                <span className="donor-blood-tag">
                                                    {donor.blood_group}
                                                </span>
                                            </td>
                                            <td>{donor.last_donation_date ?? "—"}</td>
                                            <td>{count}</td>
                                        </tr>
                                    );
                                })}

                                {filteredDonors.length === 0 && (
                                    <tr>
                                        <td colSpan={5}>No matching donor records found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="donor-panel donor-table-panel">
                <h3>Recent donation history</h3>

                <div className="donor-table-scroll">
                    <table className="donor-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Donor</th>
                                <th>Blood bank</th>
                                <th>Quantity</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {donations.map((donation) => {
                                const donor = donorById.get(donation.donor_id);
                                const profile = donor
                                    ? profileById.get(donor.user_id)
                                    : undefined;

                                return (
                                    <tr key={donation.id}>
                                        <td>{donation.donation_date}</td>
                                        <td>{profile?.full_name ?? "Donor record"}</td>
                                        <td>
                                            {bankById.get(donation.blood_bank_id)?.name ?? "—"}
                                        </td>
                                        <td>{donation.quantity_ml} ml</td>
                                        <td>
                                            <span className="donor-status-tag">
                                                {donation.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {donations.length === 0 && (
                                <tr>
                                    <td colSpan={5}>No donation records yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="donor-disclaimer">
                Blood group and donation records must be verified by authorized
                personnel. A donation marked tested is not, by itself, authorization
                to release blood. Follow applicable screening, compatibility testing,
                and clinical protocols.
            </p>
        </section>
    );
}