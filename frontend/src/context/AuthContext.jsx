import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  fetchUserTrips,
  saveUserTrip,
  deleteUserTrip,
  fetchUserPlaces,
  saveUserPlace,
  deleteUserPlaceByExternalId,
  fetchUserPreferences,
  updateUserPreferences,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [savedPlacesModalOpen, setSavedPlacesModalOpen] = useState(false);
  const [savedTripsModalOpen, setSavedTripsModalOpen] = useState(false);

  const [savedTrips, setSavedTrips] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [preferences, setPreferences] = useState(null);

  const loadUserData = useCallback(async () => {
    try {
      const [tripsData, placesData, prefsData] = await Promise.allSettled([
        fetchUserTrips(),
        fetchUserPlaces(),
        fetchUserPreferences(),
      ]);

      if (tripsData.status === "fulfilled") {
        setSavedTrips(tripsData.value);
      }
      if (placesData.status === "fulfilled") {
        setSavedPlaces(placesData.value);
      }
      if (prefsData.status === "fulfilled") {
        setPreferences(prefsData.value);
      }
    } catch (err) {
      console.warn("Could not load user data:", err);
    }
  }, []);

  // Hydrate user session on mount
  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        const currentUser = await getCurrentUser();
        if (mounted && currentUser) {
          setUser(currentUser);
          await loadUserData();
        }
      } catch (err) {
        console.warn("Session check error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    checkSession();
    return () => {
      mounted = false;
    };
  }, [loadUserData]);

  const login = async (email, password) => {
    const data = await loginUser({ email, password });
    setUser(data.user);
    setAuthModalOpen(false);
    await loadUserData();
    return data;
  };

  const register = async (email, password, name) => {
    const data = await registerUser({ email, password, name });
    setUser(data.user);
    setAuthModalOpen(false);
    await loadUserData();
    return data;
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setSavedTrips([]);
    setSavedPlaces([]);
    setPreferences(null);
  };

  const bookmarkPlace = async (place) => {
    if (!user) {
      setAuthModalOpen(true);
      return false;
    }
    try {
      const saved = await saveUserPlace({
        place_id: place.id || place.place_id || `${place.lat}-${place.lon}`,
        name: place.name || "Scenic Stop",
        category: place.category || "Viewpoints",
        lat: Number(place.lat),
        lon: Number(place.lon),
        address: place.address || place.description || "",
        description: place.description || "",
      });
      setSavedPlaces((prev) => {
        const exists = prev.some((p) => p.place_id === saved.place_id);
        if (exists) return prev;
        return [saved, ...prev];
      });
      return true;
    } catch (err) {
      console.error("Failed to bookmark place:", err);
      throw err;
    }
  };

  const unbookmarkPlace = async (placeId) => {
    if (!user) return false;
    try {
      await deleteUserPlaceByExternalId(placeId);
      setSavedPlaces((prev) => prev.filter((p) => p.place_id !== placeId && p.id !== placeId));
      return true;
    } catch (err) {
      console.error("Failed to remove bookmark:", err);
      throw err;
    }
  };

  const isPlaceSaved = (placeId) => {
    if (!placeId || !savedPlaces) return false;
    return savedPlaces.some((p) => p.place_id === placeId || p.id === placeId);
  };

  const saveTrip = async (tripData) => {
    if (!user) {
      setAuthModalOpen(true);
      return false;
    }
    try {
      const saved = await saveUserTrip(tripData);
      setSavedTrips((prev) => [saved, ...prev]);
      return saved;
    } catch (err) {
      console.error("Failed to save trip:", err);
      throw err;
    }
  };

  const deleteTrip = async (tripId) => {
    if (!user) return false;
    try {
      await deleteUserTrip(tripId);
      setSavedTrips((prev) => prev.filter((t) => t.id !== tripId));
      return true;
    } catch (err) {
      console.error("Failed to delete trip:", err);
      throw err;
    }
  };

  const savePreferences = async (newPrefs) => {
    if (!user) return null;
    try {
      const updated = await updateUserPreferences(newPrefs);
      setPreferences(updated);
      return updated;
    } catch (err) {
      console.error("Failed to update preferences:", err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        authModalOpen,
        setAuthModalOpen,
        savedPlacesModalOpen,
        setSavedPlacesModalOpen,
        savedTripsModalOpen,
        setSavedTripsModalOpen,
        savedTrips,
        savedPlaces,
        preferences,
        login,
        register,
        logout,
        bookmarkPlace,
        unbookmarkPlace,
        isPlaceSaved,
        saveTrip,
        deleteTrip,
        savePreferences,
        refreshUserData: loadUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
