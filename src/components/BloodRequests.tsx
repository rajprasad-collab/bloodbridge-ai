
import { useEffect, useState } from "react";
import {
    AlertCircle,
    ClipboardList,
    RefreshCw,
    Send,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Priority = "normal" | "high" | "urgent" | "critical";

type RequestStatus =
    | "created"
    | "searching"
    | "match_found"
    | "reserved"
    | "dispatched"
    | "received"
    | "fulfilled"
    | "cancelled";

type BloodGroup =
    | "A+"
    | "A-"
    | "B+"
    | "B-"
    | "AB+"
    | "AB-"
    | "O+"
    | "O-";

type Hospital = {
    id: string;
    name: string;
};

type BloodRequest = {
    id: string;
    hospital_id: string;
    recipient_blood_group: BloodGroup;
    component: string;
    units_required: number;
    priority: Priority;
    status: RequestStatus;
    required_by: string | null;
    created_at: string;
    hospitals?: { name: string } | null;
};

const GROUPS: BloodGroup[] = [
    "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
];

const PRIORITIES: Priority[] = [
    "normal", "high", "urgent", "critical",
];

const STATUSES: RequestStatus[] = [
    "created",
    "searching",
    "match_found",
    "reserved",
    "dispatched",
    "received",
    "fulfilled",
    "cancelled",
];

const COMPONENTS = [
    { value: "whole_blood", label: "Whole blood" },
    { value: "red_blood_cells", label: "Red blood cells" },
    { value: "plasma", label: "Plasma" },
    { value: "platelets", label: "Platelets" },
];

function label(value: string) {
    return value
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export default function BloodRequests({
    canManage = false,
}: {
    canManage?: boolean;
}) {
    const [requests, setRequests] = useState<BloodRequest[]>([]);
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showForm, setShowForm] = useState(false);

    const [hospitalId, setHospitalId] = useState("");
    const [bloodGroup, setBloodGroup] = useState<BloodGroup>("O+");
    const [component, setComponent] = useState("red_blood_cells");
    const [unitsRequired, setUnitsRequired] = useState(1);
    const [priority, setPriority] = useState<Priority>("normal");
    const [requiredBy, setRequiredBy] = useState("");

    async function loadRequests() {
        setLoading(true);
        setError("");

        const [requestResult, hospitalResult] = await Promise.all([
            supabase
                .from("blood_requests")
                .select(
                    "id, hospital_id, recipient_blood_group, component, units_required, priority, status, required_by, created_at, hospitals(name)"
                )
                .order("created_at", { ascending: false }),

            supabase
                .from("hospitals")
                .select("id, name")
                .order("name"),
        ]);

        if (requestResult.error) {
            setError(`Could not load requests: ${requestResult.error.message}`);
            setRequests([]);
        } else {
            setRequests((requestResult.data ?? []) as unknown as BloodRequest[]);
        }

        if (hospitalResult.error) {
            setError(
                (previous) =>
                    previous ||
                    `Could not load hospitals: ${hospitalResult.error.message}`
            );
        } else {
            const hospitalRows = (hospitalResult.data ?? []) as Hospital[];
            setHospitals(hospitalRows);
            if (!hospitalId && hospitalRows.length > 0) {
                setHospitalId(hospitalRows[0].id);
            }
        }

        setLoading(false);
    }

    useEffect(() => {
        void loadRequests();
        // Initial data load only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createRequest(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!hospitalId) {
            setError(
                "No hospital is available. Add a hospital record before creating a request."
            );
            return;
        }

        setSaving(true);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setError("Your session could not be verified. Please sign in again.");
            setSaving(false);
            return;
        }

        const { error: insertError } = await supabase
            .from("blood_requests")
            .insert({
                hospital_id: hospitalId,
                created_by: user.id,
                recipient_blood_group: bloodGroup,
                component,
                units_required: unitsRequired,
                priority,
                status: "created",
                required_by: requiredBy
                    ? new Date(requiredBy).toISOString()
                    : null,
            });

        if (insertError) {
            setError(`Request could not be created: ${insertError.message}`);
            setSaving(false);
            return;
        }

        setSuccess("Blood request created successfully.");
        setShowForm(false);
        setUnitsRequired(1);
        setPriority("normal");
        setRequiredBy("");
        await loadRequests();
        setSaving(false);
    }

    async function updateStatus(
        requestId: string,
        nextStatus: RequestStatus
    ) {
        setError("");
        setSuccess("");

        const request = requests.find((item) => item.id === requestId);
        if (!request || request.status === nextStatus) return;

        const confirmed = window.confirm(
            `Change request status from "${label(request.status)}" to "${label(nextStatus)}"?`
        );

        if (!confirmed) return;

        const { error: updateError } = await supabase
            .from("blood_requests")
            .update({ status: nextStatus })
            .eq("id", requestId);

        if (updateError) {
            setError(`Status update failed: ${updateError.message}`);
            return;
        }

        setSuccess("Request status updated.");
        await loadRequests();
    }

    return (
        <section className="requests-module">
            <div className="requests-heading">
                <div>
                    <span className="requests-eyebrow">REQUEST COORDINATION</span>
                    <h2>Blood Requests</h2>
                    <p>
                        Create and track hospital requests for blood components.
                    </p>
                </div>

                <div className="requests-actions">
                    <button
                        type="button"
                        className="requests-refresh"
                        onClick={() => void loadRequests()}
                        disabled={loading}
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>

                    <button
                        type="button"
                        className="requests-create-button"
                        onClick={() => setShowForm((current) => !current)}
                    >
                        <Send size={16} />
                        {showForm ? "Close form" : "New request"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="requests-message requests-error" role="alert">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {success && (
                <div className="requests-message requests-success" role="status">
                    {success}
                </div>
            )}

            {showForm && (
                <form className="requests-form" onSubmit={createRequest}>
                    <h3>Create a blood request</h3>

                    <div className="requests-form-grid">
                        <label>
                            Hospital
                            <select
                                value={hospitalId}
                                onChange={(event) => setHospitalId(event.target.value)}
                                required
                            >
                                <option value="">Select hospital</option>
                                {hospitals.map((hospital) => (
                                    <option key={hospital.id} value={hospital.id}>
                                        {hospital.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Blood group
                            <select
                                value={bloodGroup}
                                onChange={(event) =>
                                    setBloodGroup(event.target.value as BloodGroup)
                                }
                            >
                                {GROUPS.map((group) => (
                                    <option key={group} value={group}>
                                        {group}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Component
                            <select
                                value={component}
                                onChange={(event) => setComponent(event.target.value)}
                            >
                                {COMPONENTS.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Units required
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={unitsRequired}
                                onChange={(event) =>
                                    setUnitsRequired(Number(event.target.value))
                                }
                                required
                            />
                        </label>

                        <label>
                            Priority
                            <select
                                value={priority}
                                onChange={(event) =>
                                    setPriority(event.target.value as Priority)
                                }
                            >
                                {PRIORITIES.map((item) => (
                                    <option key={item} value={item}>
                                        {label(item)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Required by
                            <input
                                type="datetime-local"
                                value={requiredBy}
                                onChange={(event) => setRequiredBy(event.target.value)}
                            />
                        </label>
                    </div>

                    <p className="requests-form-note">
                        This module records operational requests. It does not determine
                        clinical compatibility or replace required blood-bank testing
                        and professional authorization.
                    </p>

                    <button
                        className="requests-submit-button"
                        type="submit"
                        disabled={saving || !hospitalId}
                    >
                        {saving ? "Submitting..." : "Submit request"}
                    </button>
                </form>
            )}

            <div className="requests-summary">
                <div className="requests-summary-card">
                    <span>Total requests</span>
                    <strong>{requests.length}</strong>
                </div>
                <div className="requests-summary-card">
                    <span>Open requests</span>
                    <strong>
                        {requests.filter(
                            (item) =>
                                !["fulfilled", "cancelled"].includes(item.status)
                        ).length}
                    </strong>
                </div>
                <div className="requests-summary-card">
                    <span>Critical priority</span>
                    <strong>
                        {requests.filter(
                            (item) =>
                                item.priority === "critical" &&
                                !["fulfilled", "cancelled"].includes(item.status)
                        ).length}
                    </strong>
                </div>
            </div>

            <div className="requests-table-card">
                <div className="requests-table-title">
                    <div>
                        <ClipboardList size={19} />
                        <h3>Request register</h3>
                    </div>
                    <span>{requests.length} records</span>
                </div>

                {loading ? (
                    <p className="requests-empty">Loading requests...</p>
                ) : requests.length === 0 ? (
                    <p className="requests-empty">
                        No requests found. Create a request to get started.
                    </p>
                ) : (
                    <div className="requests-table-wrap">
                        <table className="requests-table">
                            <thead>
                                <tr>
                                    <th>Hospital</th>
                                    <th>Group</th>
                                    <th>Component</th>
                                    <th>Units</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Required by</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map((request) => (
                                    <tr key={request.id}>
                                        <td>{request.hospitals?.name ?? "Hospital"}</td>
                                        <td>
                                            <span className="requests-blood-group">
                                                {request.recipient_blood_group}
                                            </span>
                                        </td>
                                        <td>{label(request.component)}</td>
                                        <td>{request.units_required}</td>
                                        <td>
                                            <span
                                                className={`requests-priority priority-${request.priority}`}
                                            >
                                                {label(request.priority)}
                                            </span>
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <select
                                                    className="requests-status-select"
                                                    aria-label={`Status for ${request.recipient_blood_group} request`}
                                                    value={request.status}
                                                    onChange={(event) =>
                                                        void updateStatus(
                                                            request.id,
                                                            event.target.value as RequestStatus
                                                        )
                                                    }
                                                >
                                                    {STATUSES.map((status) => (
                                                        <option key={status} value={status}>
                                                            {label(status)}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span
                                                    className={`requests-status status-${request.status}`}
                                                >
                                                    {label(request.status)}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {request.required_by
                                                ? new Date(request.required_by).toLocaleString()
                                                : "Not specified"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}