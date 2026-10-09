
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type BloodRequest = {
    id: string;
    recipient_blood_group: string;
    component: string;
    units_required: number;
    priority: string;
    status: string;
    required_by: string | null;
    created_at: string;
};

type BloodUnit = {
    id: string;
    blood_group: string;
    component: string;
    status: string;
    expiry_date: string;
    blood_bank_id: string;
    blood_banks?: { name: string } | null;
};

type MatchResult = {
    request: BloodRequest;
    availableCount: number;
    matchingUnits: BloodUnit[];
    remaining: number;
    result: "sufficient" | "partial" | "unavailable";
};

function displayLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function localToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function RequestMatching() {
    const [requests, setRequests] = useState<BloodRequest[]>([]);
    const [units, setUnits] = useState<BloodUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [reservingId, setReservingId] = useState<string | number | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        const [requestResult, unitResult] = await Promise.all([
            supabase
                .from("blood_requests")
                .select(
                    "id, recipient_blood_group, component, units_required, priority, status, required_by, created_at"
                )
                .not("status", "in", '("fulfilled","cancelled")')
                .order("created_at", { ascending: false }),

            supabase
                .from("blood_units")
                .select(
                    "id, blood_group, component, status, expiry_date, blood_bank_id, blood_banks(name)"
                ),
        ]);

        if (requestResult.error) {
            setError(`Could not load requests: ${requestResult.error.message}`);
            setRequests([]);
        } else {
            setRequests((requestResult.data ?? []) as BloodRequest[]);
        }

        if (unitResult.error) {
            setError((previous) =>
                previous ||
                `Could not load inventory: ${unitResult.error.message}`
            );
            setUnits([]);
        } else {
            setUnits((unitResult.data ?? []) as unknown as BloodUnit[]);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    async function reserveRequest(requestId: string | number) {
        setError("");
        setSuccess("");

        const confirmed = window.confirm(
            "Reserve the required matching inventory for this blood request?"
        );

        if (!confirmed) return;

        setReservingId(requestId);

        try {
            const { data, error: reservationError } = await supabase.rpc(
                "reserve_blood_units",
                { p_request_id: Number(requestId) }
            );

            if (reservationError) {
                throw reservationError;
            }

            const result = data as {
                success?: boolean;
                reserved_count?: number;
            };

            setSuccess(
                `Reservation successful. ${result.reserved_count ?? 0} inventory record(s) reserved.`
            );

            await loadData();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "An unexpected error occurred.";

            setError(`Reservation failed: ${message}`);
        } finally {
            setReservingId(null);
        }
    }

    const results: MatchResult[] = requests.map((request) => {
        const matchingUnits = units.filter(
            (unit) =>
                unit.blood_group === request.recipient_blood_group &&
                unit.component === request.component &&
                unit.status === "available" &&
                unit.expiry_date >= localToday()
        );

        const availableCount = matchingUnits.length;
        const remaining = Math.max(
            0,
            request.units_required - availableCount
        );

        let result: MatchResult["result"] = "unavailable";

        if (availableCount >= request.units_required) {
            result = "sufficient";
        } else if (availableCount > 0) {
            result = "partial";
        }

        return {
            request,
            availableCount,
            matchingUnits,
            remaining,
            result,
        };
    });

    const sufficientCount = results.filter(
        (item) => item.result === "sufficient"
    ).length;

    const partialCount = results.filter(
        (item) => item.result === "partial"
    ).length;

    const unavailableCount = results.filter(
        (item) => item.result === "unavailable"
    ).length;

    return (
        <section className="matching-module">
            <div className="matching-heading">
                <div>
                    <span className="matching-eyebrow">
                        OPERATIONAL DECISION SUPPORT
                    </span>
                    <h2>Request Matching Engine</h2>
                    <p>
                        Compare open requests with available inventory records.
                    </p>
                </div>

                <button
                    type="button"
                    className="matching-refresh"
                    onClick={() => void loadData()}
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                    Refresh matches
                </button>
            </div>

            <div className="matching-notice">
                <AlertCircle size={18} />
                <p>
                    These are preliminary operational matches based on exact group,
                    component, availability, and expiry date. They do not establish
                    clinical compatibility or authorize issue or transfusion.
                </p>
            </div>

            {error && (
                <div className="matching-error" role="alert">
                    {error}
                </div>
            )}

            {success && (
                <div className="matching-success" role="status">
                    {success}
                </div>
            )}

            <div className="matching-summary">
                <div className="matching-summary-card">
                    <span>Open requests</span>
                    <strong>{results.length}</strong>
                </div>
                <div className="matching-summary-card">
                    <span>Sufficient records</span>
                    <strong>{sufficientCount}</strong>
                </div>
                <div className="matching-summary-card">
                    <span>Partial records</span>
                    <strong>{partialCount}</strong>
                </div>
                <div className="matching-summary-card">
                    <span>No matching records</span>
                    <strong>{unavailableCount}</strong>
                </div>
            </div>

            <div className="matching-list">
                {loading ? (
                    <p className="matching-empty">Checking requests and inventory...</p>
                ) : results.length === 0 ? (
                    <p className="matching-empty">
                        No open requests found. Create a request in Blood Requests first.
                    </p>
                ) : (
                    results.map((item) => (
                        <article className="matching-card" key={item.request.id}>
                            <div className="matching-card-top">
                                <div>
                                    <span className="matching-request-id">
                                        Request {item.request.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <h3>
                                        {item.request.recipient_blood_group}{" "}
                                        {displayLabel(item.request.component)}
                                    </h3>
                                    <p>
                                        Priority:{" "}
                                        <strong>{displayLabel(item.request.priority)}</strong>
                                    </p>
                                </div>

                                <span className={`matching-result result-${item.result}`}>
                                    {item.result === "sufficient"
                                        ? "Sufficient stock"
                                        : item.result === "partial"
                                            ? "Partial stock"
                                            : "No matching stock"}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="matching-reserve-button"
                                disabled={
                                    reservingId === item.request.id ||
                                    item.result !== "sufficient"
                                }
                                onClick={() => void reserveRequest(item.request.id)}
                            >
                                {reservingId === item.request.id
                                    ? "Reserving..."
                                    : "Reserve matching stock"}
                            </button>

                            <div className="matching-quantity">
                                <div>
                                    <span>Requested</span>
                                    <strong>{item.request.units_required}</strong>
                                </div>
                                <div>
                                    <span>Available records</span>
                                    <strong>{item.availableCount}</strong>
                                </div>
                                <div>
                                    <span>Still needed</span>
                                    <strong>{item.remaining}</strong>
                                </div>
                            </div>

                            {item.matchingUnits.length > 0 && (
                                <div className="matching-inventory">
                                    <h4>Matching inventory records</h4>
                                    {item.matchingUnits.map((unit) => (
                                        <div className="matching-unit" key={unit.id}>
                                            <span>
                                                {unit.blood_banks?.name ?? "Blood bank"}
                                            </span>
                                            <span>
                                                Expires: {unit.expiry_date}
                                            </span>
                                            <span className="matching-unit-status">
                                                Available
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {item.request.required_by && (
                                <p className="matching-deadline">
                                    Required by:{" "}
                                    {new Date(item.request.required_by).toLocaleString()}
                                </p>
                            )}
                        </article>
                    ))
                )}
            </div>
        </section>
    );
}