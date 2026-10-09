
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
    AlertTriangle,
    Droplets,
    RefreshCw,
    Search,
    ShieldCheck,
    Plus,
    X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type BloodGroup =
    | "A+"
    | "A-"
    | "B+"
    | "B-"
    | "AB+"
    | "AB-"
    | "O+"
    | "O-";

type ComponentType =
    | "whole_blood"
    | "red_blood_cells"
    | "plasma"
    | "platelets";

type UnitStatus =
    | "testing"
    | "available"
    | "reserved"
    | "issued"
    | "expired"
    | "discarded";

type BloodBank = {
    id: string;
    name: string;
    city: string | null;
};

type BloodUnit = {
    id: string;
    blood_bank_id: string;
    blood_group: BloodGroup;
    component: ComponentType;
    collection_date: string;
    expiry_date: string;
    status: UnitStatus;
    blood_banks?: {
        name: string;
        city: string | null;
    } | null;
};

const BLOOD_GROUPS: BloodGroup[] = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
];

const COMPONENTS: { value: ComponentType; label: string }[] = [
    { value: "whole_blood", label: "Whole blood" },
    { value: "red_blood_cells", label: "Red blood cells" },
    { value: "plasma", label: "Plasma" },
    { value: "platelets", label: "Platelets" },
];

const STATUSES: UnitStatus[] = [
    "testing",
    "available",
    "reserved",
    "issued",
    "expired",
    "discarded",
];

const today = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const formatDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

const labelFor = (value: string) =>
    value.replace(/_/g, " ").replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
    );

function getExpiryState(expiryDate: string) {
    const currentDate = today();

    if (expiryDate < currentDate) return "expired";

    const remainingDays = Math.ceil(
        (new Date(`${expiryDate}T00:00:00`).getTime() -
            new Date(`${currentDate}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (remainingDays <= 7) return "expiring";

    return "normal";
}

export default function Inventory({
    canManage = false,
}: {
    canManage?: boolean;
}) {
    const [units, setUnits] = useState<BloodUnit[]>([]);
    const [banks, setBanks] = useState<BloodBank[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [search, setSearch] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [showForm, setShowForm] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        blood_bank_id: "",
        blood_group: "O+" as BloodGroup,
        component: "red_blood_cells" as ComponentType,
        collection_date: today(),
        expiry_date: "",
    });

    const loadInventory = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [unitsResult, banksResult] = await Promise.all([
                supabase
                    .from("blood_units")
                    .select(
                        "id, blood_bank_id, blood_group, component, collection_date, expiry_date, status, blood_banks(name, city)"
                    )
                    .order("expiry_date", { ascending: true }),

                supabase
                    .from("blood_banks")
                    .select("id, name, city")
                    .order("name", { ascending: true }),
            ]);

            if (unitsResult.error) {
                setError(
                    `Could not load inventory: ${unitsResult.error.message}`
                );
                setUnits([]);
            } else {
                setUnits((unitsResult.data ?? []) as unknown as BloodUnit[]);
            }

            if (banksResult.error) {
                setError((previous) =>
                    previous
                        ? `${previous} | Could not load blood banks: ${banksResult.error.message}`
                        : `Could not load blood banks: ${banksResult.error.message}`
                );
                setBanks([]);
            } else {
                const bankRows = (banksResult.data ?? []) as BloodBank[];
                setBanks(bankRows);

                setForm((previous) => ({
                    ...previous,
                    blood_bank_id:
                        previous.blood_bank_id || bankRows[0]?.id || "",
                }));
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "An unexpected error occurred while loading inventory."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadInventory();
    }, [loadInventory]);

    const counts = useMemo(() => {
        const currentDate = today();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const sevenDaysDate = [
            sevenDaysFromNow.getFullYear(),
            String(sevenDaysFromNow.getMonth() + 1).padStart(2, "0"),
            String(sevenDaysFromNow.getDate()).padStart(2, "0"),
        ].join("-");

        return {
            total: units.length,

            available: units.filter(
                (unit) =>
                    unit.status === "available" &&
                    unit.expiry_date >= currentDate
            ).length,

            expiring: units.filter(
                (unit) =>
                    unit.expiry_date >= currentDate &&
                    unit.expiry_date <= sevenDaysDate &&
                    !["issued", "discarded", "expired"].includes(unit.status)
            ).length,

            expired: units.filter(
                (unit) =>
                    unit.expiry_date < currentDate ||
                    unit.status === "expired"
            ).length,
        };
    }, [units]);

    const filteredUnits = useMemo(() => {
        const query = search.trim().toLowerCase();

        return units.filter((unit) => {
            const bankName = unit.blood_banks?.name ?? "";

            const matchesSearch =
                !query ||
                unit.blood_group.toLowerCase().includes(query) ||
                labelFor(unit.component).toLowerCase().includes(query) ||
                bankName.toLowerCase().includes(query) ||
                (unit.blood_banks?.city ?? "").toLowerCase().includes(query) ||
                unit.id.toLowerCase().includes(query);

            const matchesGroup =
                groupFilter === "all" || unit.blood_group === groupFilter;

            const matchesStatus =
                statusFilter === "all" || unit.status === statusFilter;

            return matchesSearch && matchesGroup && matchesStatus;
        });
    }, [units, search, groupFilter, statusFilter]);

    async function handleAddUnit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!form.blood_bank_id) {
            setError("No blood bank is available. Add a blood bank first.");
            return;
        }

        if (!form.expiry_date) {
            setError("Enter the expiry date.");
            return;
        }

        if (form.expiry_date <= form.collection_date) {
            setError("Expiry date must be after the collection date.");
            return;
        }

        if (form.collection_date > today()) {
            setError("Collection date cannot be in the future.");
            return;
        }

        setSaving(true);

        try {
            // New units begin in Testing status.
            // Staff must follow required checks before changing status.
            const { error: insertError } = await supabase
                .from("blood_units")
                .insert({
                    blood_bank_id: form.blood_bank_id,
                    blood_group: form.blood_group,
                    component: form.component,
                    collection_date: form.collection_date,
                    expiry_date: form.expiry_date,
                    status: "testing",
                });

            if (insertError) {
                setError(`Could not add blood unit: ${insertError.message}`);
                return;
            }

            setSuccess("Blood unit registered with status: Testing.");
            setShowForm(false);

            setForm((previous) => ({
                ...previous,
                collection_date: today(),
                expiry_date: "",
            }));

            await loadInventory();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "An unexpected error occurred while adding the unit."
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleStatusChange(
        unitId: string,
        newStatus: UnitStatus
    ) {
        setError("");
        setSuccess("");

        const unit = units.find((item) => item.id === unitId);

        if (!unit || unit.status === newStatus) return;

        if (
            newStatus === "available" &&
            unit.expiry_date < today()
        ) {
            setError("An expired unit cannot be marked available.");
            return;
        }

        if (unit.status === "reserved" && newStatus !== "reserved") {
            setError(
                "Reserved units must be released through the request-reservation workflow."
            );
            return;
        }

        const confirmed = window.confirm(
            `Change this unit's status from ${labelFor(unit.status)} to ${labelFor(newStatus)}?`
        );

        if (!confirmed) return;

        setUpdatingId(unitId);

        try {
            const { error: updateError } = await supabase
                .from("blood_units")
                .update({ status: newStatus })
                .eq("id", unitId);

            if (updateError) {
                setError(`Status update failed: ${updateError.message}`);
                return;
            }

            setSuccess("Inventory status updated.");
            await loadInventory();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "An unexpected error occurred while updating status."
            );
        } finally {
            setUpdatingId(null);
        }
    }

    return (
        <section className="inventory-page">
            <div className="inventory-heading">
                <div>
                    <p className="inventory-eyebrow">
                        BLOODBRIDGE AI / OPERATIONS
                    </p>
                    <h1>Blood inventory</h1>
                    <p className="inventory-subtitle">
                        Monitor stock, component types, and expiry dates.
                    </p>
                </div>

                <div className="inventory-actions">
                    <button
                        className="inventory-button inventory-button-secondary"
                        onClick={() => void loadInventory()}
                        disabled={loading}
                        type="button"
                    >
                        <RefreshCw size={17} />
                        Refresh
                    </button>

                    {canManage && (
                        <button
                            className="inventory-button inventory-button-primary"
                            onClick={() => {
                                setError("");
                                setSuccess("");
                                setShowForm((value) => !value);
                            }}
                            type="button"
                        >
                            {showForm ? <X size={17} /> : <Plus size={17} />}
                            {showForm ? "Close form" : "Add blood unit"}
                        </button>
                    )}
                </div>
            </div>

            <div className="inventory-notice">
                <ShieldCheck size={19} />
                <span>
                    Operational tracking only. Clinical compatibility, testing,
                    and release decisions must follow approved blood-bank
                    protocols.
                </span>
            </div>

            {error && (
                <div className="inventory-message inventory-error" role="alert">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div
                    className="inventory-message inventory-success"
                    role="status"
                >
                    <ShieldCheck size={18} />
                    <span>{success}</span>
                </div>
            )}

            {canManage && showForm && (
                <form className="inventory-form" onSubmit={handleAddUnit}>
                    <div className="inventory-form-heading">
                        <div>
                            <h2>Register a blood unit</h2>
                            <p>
                                This creates one inventory record. Its initial status
                                is Testing.
                            </p>
                        </div>
                    </div>

                    <div className="inventory-form-grid">
                        <label>
                            Blood bank
                            <select
                                value={form.blood_bank_id}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        blood_bank_id: event.target.value,
                                    })
                                }
                                required
                            >
                                <option value="">Select a blood bank</option>
                                {banks.map((bank) => (
                                    <option key={bank.id} value={bank.id}>
                                        {bank.name}
                                        {bank.city ? ` — ${bank.city}` : ""}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Blood group
                            <select
                                value={form.blood_group}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        blood_group: event.target.value as BloodGroup,
                                    })
                                }
                            >
                                {BLOOD_GROUPS.map((group) => (
                                    <option key={group} value={group}>
                                        {group}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Component
                            <select
                                value={form.component}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        component: event.target.value as ComponentType,
                                    })
                                }
                            >
                                {COMPONENTS.map((component) => (
                                    <option
                                        key={component.value}
                                        value={component.value}
                                    >
                                        {component.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Collection date
                            <input
                                type="date"
                                value={form.collection_date}
                                max={today()}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        collection_date: event.target.value,
                                    })
                                }
                                required
                            />
                        </label>

                        <label>
                            Expiry date
                            <input
                                type="date"
                                value={form.expiry_date}
                                min={form.collection_date}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        expiry_date: event.target.value,
                                    })
                                }
                                required
                            />
                        </label>
                    </div>

                    <div className="inventory-form-footer">
                        <span className="inventory-status status-testing">
                            Initial status: Testing
                        </span>

                        <button
                            className="inventory-button inventory-button-primary"
                            type="submit"
                            disabled={saving || banks.length === 0}
                        >
                            {saving ? "Saving..." : "Register unit"}
                        </button>
                    </div>
                </form>
            )}

            <div className="inventory-stats">
                <article className="inventory-stat">
                    <span className="inventory-stat-icon">
                        <Droplets size={20} />
                    </span>
                    <span className="inventory-stat-label">Total records</span>
                    <strong>{counts.total}</strong>
                    <small>All recorded units</small>
                </article>

                <article className="inventory-stat">
                    <span className="inventory-stat-icon">
                        <ShieldCheck size={20} />
                    </span>
                    <span className="inventory-stat-label">Available</span>
                    <strong>{counts.available}</strong>
                    <small>Marked available and not past expiry</small>
                </article>

                <article className="inventory-stat">
                    <span className="inventory-stat-icon">
                        <AlertTriangle size={20} />
                    </span>
                    <span className="inventory-stat-label">Expiring soon</span>
                    <strong>{counts.expiring}</strong>
                    <small>Expiry within 7 days</small>
                </article>

                <article className="inventory-stat">
                    <span className="inventory-stat-icon">
                        <AlertTriangle size={20} />
                    </span>
                    <span className="inventory-stat-label">Expired</span>
                    <strong>{counts.expired}</strong>
                    <small>Past expiry or marked expired</small>
                </article>
            </div>

            <div className="inventory-table-card">
                <div className="inventory-table-heading">
                    <div>
                        <h2>Inventory records</h2>
                        <p>{filteredUnits.length} record(s) shown</p>
                    </div>
                </div>

                <div className="inventory-filters">
                    <div className="inventory-search">
                        <Search size={18} />
                        <input
                            type="search"
                            placeholder="Search group, component, bank..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>

                    <select
                        aria-label="Filter by blood group"
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                    >
                        <option value="all">All blood groups</option>
                        {BLOOD_GROUPS.map((group) => (
                            <option key={group} value={group}>
                                {group}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="Filter by status"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                    >
                        <option value="all">All statuses</option>
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {labelFor(status)}
                            </option>
                        ))}
                    </select>
                </div>

                {loading ? (
                    <div className="inventory-empty">Loading inventory...</div>
                ) : filteredUnits.length === 0 ? (
                    <div className="inventory-empty">
                        <Droplets size={30} />
                        <strong>No inventory records found</strong>
                        <span>
                            Add a blood unit or change the search and filter settings.
                        </span>
                    </div>
                ) : (
                    <div className="inventory-table-wrap">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Blood group</th>
                                    <th>Component</th>
                                    <th>Blood bank</th>
                                    <th>Collected</th>
                                    <th>Expires</th>
                                    <th>Status</th>
                                    <th>Expiry monitor</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredUnits.map((unit) => {
                                    const expiryState = getExpiryState(unit.expiry_date);
                                    const isUnavailable = [
                                        "issued",
                                        "discarded",
                                        "expired",
                                    ].includes(unit.status);

                                    return (
                                        <tr key={unit.id}>
                                            <td>
                                                <span className="inventory-blood-group">
                                                    {unit.blood_group}
                                                </span>
                                            </td>

                                            <td>{labelFor(unit.component)}</td>

                                            <td>
                                                <strong>
                                                    {unit.blood_banks?.name ?? "Unknown bank"}
                                                </strong>
                                                <small className="inventory-cell-subtitle">
                                                    {unit.blood_banks?.city ?? ""}
                                                </small>
                                            </td>

                                            <td>{formatDate(unit.collection_date)}</td>
                                            <td>{formatDate(unit.expiry_date)}</td>

                                            <td>
                                                {canManage ? (
                                                    <select
                                                        aria-label={`Update status for ${unit.blood_group} unit`}
                                                        className="inventory-status-select"
                                                        value={unit.status}
                                                        disabled={
                                                            updatingId === unit.id ||
                                                            unit.status === "reserved"
                                                        }
                                                        onChange={(event) =>
                                                            void handleStatusChange(
                                                                unit.id,
                                                                event.target.value as UnitStatus
                                                            )
                                                        }
                                                    >
                                                        {STATUSES.map((status) => (
                                                            <option key={status} value={status}>
                                                                {labelFor(status)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span
                                                        className={`inventory-status status-${unit.status}`}
                                                    >
                                                        {labelFor(unit.status)}
                                                    </span>
                                                )}
                                            </td>

                                            <td>
                                                {isUnavailable ? (
                                                    <span className="expiry-neutral">
                                                        Not in active stock
                                                    </span>
                                                ) : expiryState === "expired" ? (
                                                    <span className="expiry-danger">
                                                        Expired — review
                                                    </span>
                                                ) : expiryState === "expiring" ? (
                                                    <span className="expiry-warning">
                                                        Expiring soon
                                                    </span>
                                                ) : (
                                                    <span className="expiry-ok">Within date</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="inventory-footnote">
                Expiry warnings are informational. The application does not
                automatically change a unit's database status when its expiry
                date passes. Follow your facility's review and disposition
                procedure.
            </p>
        </section>
    );
}