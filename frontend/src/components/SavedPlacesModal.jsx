import React from "react";
import { useAuth } from "../context/AuthContext";
import { BookmarkIcon, TrashIcon, MapPinIcon, XIcon, CompassIcon } from "./Icons";

export default function SavedPlacesModal({ onSelectPlace, onAddStop }) {
  const { savedPlacesModalOpen, setSavedPlacesModalOpen, savedPlaces, unbookmarkPlace } = useAuth();

  if (!savedPlacesModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 transition-all overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <BookmarkIcon size={22} filled />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Saved Places & Bookmarks
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {savedPlaces.length} {savedPlaces.length === 1 ? "place" : "places"} bookmarked across your journeys
              </p>
            </div>
          </div>
          <button
            onClick={() => setSavedPlacesModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3">
          {savedPlaces.length === 0 ? (
            <div className="py-12 text-center">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                <BookmarkIcon size={28} />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No saved places yet
              </h3>
              <p className="max-w-xs mx-auto mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tap the bookmark icon on any scenic viewpoint, roadside eatery, or attraction to save it here for future trips.
              </p>
            </div>
          ) : (
            savedPlaces.map((place) => (
              <div
                key={place.id || place.place_id}
                className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 hover:border-amber-500/40 transition-all group"
              >
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      {place.category || "Scenic Vista"}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {place.name}
                    </h4>
                  </div>

                  {place.address && (
                    <p className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <MapPinIcon size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{place.address}</span>
                    </p>
                  )}

                  {place.description && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {place.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onSelectPlace && (
                    <button
                      onClick={() => {
                        onSelectPlace(place);
                        setSavedPlacesModalOpen(false);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:border-emerald-500/30 transition-colors flex items-center gap-1"
                      title="View on Map"
                    >
                      <CompassIcon size={13} />
                      <span>View</span>
                    </button>
                  )}

                  {onAddStop && (
                    <button
                      onClick={() => {
                        onAddStop({
                          id: place.place_id,
                          name: place.name,
                          lat: place.lat,
                          lon: place.lon,
                          category: place.category,
                          description: place.description,
                        });
                        setSavedPlacesModalOpen(false);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      title="Add to Itinerary"
                    >
                      + Add Stop
                    </button>
                  )}

                  <button
                    onClick={() => unbookmarkPlace(place.place_id || place.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    title="Remove from saved"
                    aria-label="Remove place"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>Saved places sync across sessions and devices.</span>
          <button
            onClick={() => setSavedPlacesModalOpen(false)}
            className="px-3 py-1 font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
