import React from "react";
import { useAuth } from "../context/AuthContext";
import { RouteIcon, TrashIcon, MapPinIcon, XIcon, ClockIcon } from "./Icons";

export default function SavedTripsModal({ onLoadTrip }) {
  const { savedTripsModalOpen, setSavedTripsModalOpen, savedTrips, deleteTrip } = useAuth();

  if (!savedTripsModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 transition-all overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <RouteIcon size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Saved Trips & Itineraries
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {savedTrips.length} {savedTrips.length === 1 ? "route" : "routes"} saved to your account
              </p>
            </div>
          </div>
          <button
            onClick={() => setSavedTripsModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {savedTrips.length === 0 ? (
            <div className="py-12 text-center">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                <RouteIcon size={28} />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No saved trips yet
              </h3>
              <p className="max-w-xs mx-auto mt-1 text-xs text-slate-500 dark:text-slate-400">
                Plan a route between any two cities, customize scenic detours, and click "Save Trip" to keep it here.
              </p>
            </div>
          ) : (
            savedTrips.map((trip) => {
              const formattedDate = trip.created_at
                ? new Date(trip.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "";

              return (
                <div
                  key={trip.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 hover:border-blue-500/40 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {trip.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                          <MapPinIcon size={13} className="text-emerald-500 shrink-0" />
                          {trip.start_location} → {trip.destination}
                        </span>
                        {trip.distance_km && (
                          <span>{Math.round(trip.distance_km)} km</span>
                        )}
                        {trip.duration_min && (
                          <span className="flex items-center gap-1">
                            <ClockIcon size={12} className="text-slate-400" />
                            {Math.round(trip.duration_min)} min
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (onLoadTrip) onLoadTrip(trip);
                          setSavedTripsModalOpen(false);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                      >
                        Load Journey
                      </button>

                      <button
                        onClick={() => deleteTrip(trip.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="Delete Trip"
                        aria-label="Delete trip"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>

                  {trip.stops && trip.stops.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                      <span className="text-slate-400 font-medium">Scenic Stops:</span>
                      {trip.stops.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-white dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                        >
                          {s.name || s.title || `Stop ${idx + 1}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {formattedDate && (
                    <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                      Saved on {formattedDate}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>Trips are stored securely in SQLite database.</span>
          <button
            onClick={() => setSavedTripsModalOpen(false)}
            className="px-3 py-1 font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
