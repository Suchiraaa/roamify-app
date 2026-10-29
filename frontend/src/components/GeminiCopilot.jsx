import { useState, useRef, useEffect } from "react";
import {
  SparklesIcon,
  BotIcon,
  SendIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  XIcon,
} from "./Icons";
import {
  fetchGeminiCopilotPlan,
  fetchGeminiReplan,
  sendCopilotChatMessage,
} from "../services/api";

// Simple lightweight Markdown renderer for headings, lists, bold text, and paragraphs
function SimpleMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let currentList = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="copilot-md-list">
          {currentList.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const formatInline = (text) => {
    // Process bold text **text**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      return;
    }

    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={index} className="copilot-md-h4">
          {formatInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={index} className="copilot-md-h3">
          {formatInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={index} className="copilot-md-h2">
          {formatInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      currentList.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      currentList.push(line.replace(/^\d+\.\s/, ""));
    } else {
      flushList();
      elements.push(
        <p key={index} className="copilot-md-p">
          {formatInline(line)}
        </p>
      );
    }
  });

  flushList();
  return <div className="copilot-md-body">{elements}</div>;
}

export default function GeminiCopilot({
  startLocation,
  destination,
  interests = [],
  budget = "Moderate",
  duration = "3 hours",
  tripResult = null,
  weatherSummary = "",
  isOpen = false,
  onClose = null,
  isDrawer = false,
}) {
  const [activeTab, setActiveTab] = useState("strategy"); // 'strategy' | 'replan' | 'chat'
  const [strategyResult, setStrategyResult] = useState(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState("");

  const [replanReason, setReplanReason] = useState("");
  const [replanResult, setReplanResult] = useState(null);
  const [replanLoading, setReplanLoading] = useState(false);
  const [replanError, setReplanError] = useState("");

  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text: "Hello! I am your Roamify Co-Pilot. I can answer questions about your route, recommend local delicacies, scenic stops, and suggest contingency adjustments.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === "chat" && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  // Construct current trip context object matching TripRequest
  const buildTripContext = () => {
    const originStr =
      typeof startLocation === "string"
        ? startLocation
        : startLocation?.name || "";
    const destStr =
      typeof destination === "string"
        ? destination
        : destination?.name || "";

    const scenicStopsContext = (tripResult?.scenic_stops || [])
      .filter((s) => s.is_included !== false)
      .map((s) => ({
        name: s.name,
        category: s.category,
        lat: s.lat,
        lon: s.lon,
        detour_min: s.detour_min,
      }));

    return {
      origin: originStr,
      destination: destStr,
      interests: interests.length > 0 ? interests : ["Nature"],
      budget,
      time_available: duration,
      extra_preferences: "",
      route_distance_km: tripResult?.scenic_route?.distance_km || tripResult?.direct_route?.distance_km || 0,
      route_duration_min: tripResult?.scenic_route?.duration_min || tripResult?.direct_route?.duration_min || 0,
      planned_stops: scenicStopsContext,
      weather_summary: weatherSummary || "Seasonable highway conditions",
    };
  };

  // 1. Generate Full Journey Strategy
  const handleGenerateStrategy = async () => {
    const tripContext = buildTripContext();
    if (!tripContext.origin || !tripContext.destination) {
      setStrategyError("Please enter both departure and destination first.");
      return;
    }

    setStrategyLoading(true);
    setStrategyError("");
    try {
      const res = await fetchGeminiCopilotPlan(tripContext);
      setStrategyResult(res);
    } catch (err) {
      console.error("Gemini Co-Pilot strategy error:", err);
      setStrategyError(err.message || "Failed to generate strategy from Gemini.");
    } finally {
      setStrategyLoading(false);
    }
  };

  // 2. Adaptive Replan
  const handleReplan = async (customReason = "") => {
    const reasonToUse = customReason || replanReason;
    if (!reasonToUse.trim()) {
      setReplanError("Please specify a reason for replanning.");
      return;
    }

    const tripContext = buildTripContext();
    if (!tripContext.origin || !tripContext.destination) {
      setReplanError("Please enter both departure and destination first.");
      return;
    }

    setReplanLoading(true);
    setReplanError("");
    try {
      const res = await fetchGeminiReplan({
        ...tripContext,
        reason: reasonToUse.trim(),
      });
      setReplanResult(res);
    } catch (err) {
      console.error("Gemini Replan error:", err);
      setReplanError(err.message || "Failed to replan route advice.");
    } finally {
      setReplanLoading(false);
    }
  };

  // 3. Interactive Chat Turn
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);

    try {
      const tripContext = buildTripContext();
      // Format history
      const history = chatMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        text: m.text,
      }));

      const res = await sendCopilotChatMessage(userMsg, tripContext, history);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.reply,
          modelUsed: res.model_used,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `⚠️ Co-Pilot error: ${err.message || "Could not reach Gemini service."}`,
          isError: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const hasTrip = Boolean(
    (typeof startLocation === "string" ? startLocation.trim() : startLocation?.name) &&
    (typeof destination === "string" ? destination.trim() : destination?.name)
  );

  const containerContent = (
    <div className={`gemini-copilot-panel ${isDrawer ? "is-drawer-mode" : "is-section-mode"}`}>
      {/* Panel Header */}
      <div className="copilot-header">
        <div className="copilot-brand-title">
          <div className="copilot-sparkle-pill">
            <SparklesIcon size={16} className="sparkle-svg" />
            <span>Gemini AI</span>
          </div>
          <div>
            <h3 className="copilot-main-title">Roamify Co-Pilot</h3>
            <span className="copilot-sub">Intelligent Road-Trip Companion</span>
          </div>
        </div>

        <div className="copilot-header-actions">
          {strategyResult?.model_used && (
            <span className="model-indicator-badge">
              {strategyResult.model_used}
            </span>
          )}
          {isDrawer && onClose && (
            <button
              type="button"
              className="btn-copilot-close"
              onClick={onClose}
              aria-label="Close Gemini Co-Pilot"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="copilot-tabs-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "strategy"}
          className={`copilot-tab-btn ${activeTab === "strategy" ? "is-active" : ""}`}
          onClick={() => setActiveTab("strategy")}
        >
          <SparklesIcon size={14} />
          <span>Journey Strategy</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "replan"}
          className={`copilot-tab-btn ${activeTab === "replan" ? "is-active" : ""}`}
          onClick={() => setActiveTab("replan")}
        >
          <RefreshCwIcon size={14} />
          <span>Adaptive Replan</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "chat"}
          className={`copilot-tab-btn ${activeTab === "chat" ? "is-active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          <BotIcon size={14} />
          <span>Co-Pilot Chat</span>
        </button>
      </div>

      {/* TAB 1: JOURNEY STRATEGY */}
      {activeTab === "strategy" && (
        <div className="copilot-tab-pane">
          {!strategyResult ? (
            <div className="copilot-empty-state">
              <div className="empty-sparkle-icon">
                <SparklesIcon size={32} />
              </div>
              <h4>Orchestrate your road trip with Gemini AI</h4>
              <p>
                Get realistic departure guidance, ordered stop timelines, regional dining highlights,
                and accurate budget breakdowns in INR aligned to your corridor.
              </p>

              {strategyError && (
                <div className="copilot-alert-banner">
                  <AlertTriangleIcon size={16} />
                  <span>{strategyError}</span>
                </div>
              )}

              <button
                type="button"
                className="btn-generate-strategy"
                onClick={handleGenerateStrategy}
                disabled={strategyLoading || !hasTrip}
              >
                {strategyLoading ? (
                  <>
                    <span className="btn-spinner" /> Generating Live Strategy...
                  </>
                ) : (
                  <>
                    <SparklesIcon size={16} /> Generate AI Journey Strategy
                  </>
                )}
              </button>
              {!hasTrip && (
                <span className="copilot-hint-msg">
                  (Configure your departure and destination above first)
                </span>
              )}
            </div>
          ) : (
            <div className="copilot-result-container">
              <div className="copilot-result-actions">
                <span className="result-model-tag">
                  Model: {strategyResult.model_used || "Google Gemini"}
                </span>
                <button
                  type="button"
                  className="btn-copilot-secondary"
                  onClick={handleGenerateStrategy}
                  disabled={strategyLoading}
                  title="Regenerate trip strategy"
                >
                  <RefreshCwIcon size={13} className={strategyLoading ? "spin-icon" : ""} />
                  <span>Regenerate</span>
                </button>
              </div>

              <div className="copilot-markdown-scroll">
                <SimpleMarkdown content={strategyResult.answer} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ADAPTIVE REPLAN */}
      {activeTab === "replan" && (
        <div className="copilot-tab-pane">
          <p className="replan-intro">
            Quickly adapt your trip strategy when road or weather conditions change:
          </p>

          <div className="replan-quick-chips">
            {[
              "Heavy rain detected: suggest covered scenic stops and dry viewpoints",
              "Running 45 minutes late: prioritize top scenic stop only",
              "Recommend top local vegetarian highway dining spots",
              "Scenic photography focus: golden hour viewpoints along the route",
            ].map((chipPrompt, idx) => (
              <button
                key={idx}
                type="button"
                className="replan-chip-btn"
                onClick={() => {
                  setReplanReason(chipPrompt);
                  handleReplan(chipPrompt);
                }}
              >
                {chipPrompt}
              </button>
            ))}
          </div>

          <form
            className="replan-custom-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleReplan();
            }}
          >
            <input
              type="text"
              className="replan-custom-input"
              placeholder="Or type custom adjustment (e.g., traveling with kids, need cafes with clean restrooms)..."
              value={replanReason}
              onChange={(e) => setReplanReason(e.target.value)}
            />
            <button
              type="submit"
              className="btn-replan-submit"
              disabled={replanLoading || !replanReason.trim() || !hasTrip}
            >
              {replanLoading ? <span className="btn-spinner" /> : "Replan"}
            </button>
          </form>

          {replanError && (
            <div className="copilot-alert-banner">
              <AlertTriangleIcon size={16} />
              <span>{replanError}</span>
            </div>
          )}

          {replanResult && (
            <div className="copilot-result-container">
              <div className="copilot-result-actions">
                <span className="result-model-tag">
                  Adapted with {replanResult.model_used || "Gemini"}
                </span>
              </div>
              <div className="copilot-markdown-scroll">
                <SimpleMarkdown content={replanResult.answer} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CO-PILOT CHAT */}
      {activeTab === "chat" && (
        <div className="copilot-chat-pane">
          <div className="copilot-chat-messages">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`copilot-chat-bubble ${
                  msg.role === "user" ? "is-user" : "is-assistant"
                } ${msg.isError ? "is-error" : ""}`}
              >
                <div className="chat-bubble-avatar">
                  {msg.role === "user" ? "👤" : "✨"}
                </div>
                <div className="chat-bubble-content">
                  <SimpleMarkdown content={msg.text} />
                  {msg.modelUsed && (
                    <span className="chat-model-hint">via {msg.modelUsed}</span>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="copilot-chat-bubble is-assistant is-typing">
                <div className="chat-bubble-avatar">✨</div>
                <div className="chat-typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <form className="copilot-chat-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="copilot-chat-input"
              placeholder="Ask anything about this road trip corridor..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button
              type="submit"
              className="btn-copilot-send"
              disabled={chatLoading || !chatInput.trim()}
              aria-label="Send query to Gemini Co-Pilot"
            >
              <SendIcon size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );

  if (isDrawer) {
    if (!isOpen) return null;
    return (
      <div className="copilot-drawer-overlay">
        <div className="copilot-drawer-container">{containerContent}</div>
      </div>
    );
  }

  return (
    <section id="gemini-copilot-section" className="copilot-section-wrap" aria-label="Gemini AI Co-Pilot">
      {containerContent}
    </section>
  );
}
