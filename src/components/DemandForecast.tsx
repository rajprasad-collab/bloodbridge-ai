import { Activity } from "lucide-react";

export default function DemandForecast() {
    return (
        <section className="dashboard-card">
            <h2>
                <Activity size={20} /> Demand Forecast
            </h2>
            <p>
                Demand forecasting will display blood-group demand trends
                based on recorded blood requests.
            </p>
        </section>
    );
}