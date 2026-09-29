import StaffGate from "./src/StaffGate";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { submitEmergencyAlert, submitMissingReport, submitTrustCheck } from "./src/mobileApi";
import { searchOfficialCases } from "./src/officialCasesApi";
import { hasSupabaseConfig, volunteerName } from "./src/supabase";
import { loadTasks, reportTaskFound, subscribeToTaskChanges, taskStatuses, updateTaskStatus } from "./src/tasksApi";

const statusLabels = {
  new: "New",
  accepted: "Accepted",
  en_route: "En route",
  on_scene: "On scene",
  completed: "Completed",
  escalated: "Escalated",
};

const priorityOrder = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const appFont = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

function sourceLabel(source) {
  if (source === "whatsapp") return "WhatsApp";
  if (source === "ipad_booth" || source === "booth") return "Booth";
  if (source === "mobile_app") return "Mobile";
  return source || "Live";
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinatesFromText(text) {
  if (!text) return null;
  const match = String(text).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = numberOrNull(match[1]);
  const longitude = numberOrNull(match[2]);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function coordinatesFromCase(liveCase) {
  const data = liveCase?.structured_data || {};
  const gps = data.gps || {};

  const candidates = [
    { latitude: gps.latitude, longitude: gps.longitude },
    { latitude: data.latitude, longitude: data.longitude },
    { latitude: data.lat, longitude: data.lng },
    coordinatesFromText(liveCase?.last_seen_location),
    coordinatesFromText(liveCase?.raw_report),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const latitude = numberOrNull(candidate.latitude);
    const longitude = numberOrNull(candidate.longitude);
    if (latitude === null || longitude === null) continue;
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }

  return null;
}

function taskDescriptionLines(description) {
  if (!description) return [];
  return String(description)
    .replace(/\s+Last seen:/g, "\nLast seen:")
    .replace(/\s+GPS:/g, "\nGPS:")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith("gps:")) return false;
      return !/^([^/]+)\s*\/\s*([^/]+)\s*\/\s*([^/]+)\./.test(normalized);
    })
    .filter(Boolean);
}

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function callablePhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("*")) return null;
  const normalized = raw.replace(/[^\d+]/g, "");
  const digitCount = normalized.replace(/\D/g, "").length;
  if (digitCount < 8) return null;
  return normalized;
}

async function callPhoneNumber(value) {
  const phoneNumber = callablePhoneNumber(value);
  if (!phoneNumber) {
    Alert.alert("Number unavailable", "This record does not include a callable phone number.");
    return;
  }

  const url = `tel:${phoneNumber}`;
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    Alert.alert("Calling unavailable", "This device cannot open the phone app.");
    return;
  }
  await Linking.openURL(url);
}

export default function App() {
  return <StaffGate><VolunteerApp /></StaffGate>;
}

function VolunteerApp() {
  const [activeTab, setActiveTab] = useState("help");
  const [tasks, setTasks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [demoMode, setDemoMode] = useState(!hasSupabaseConfig);
  const [missingPersonName, setMissingPersonName] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [gender, setGender] = useState("");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [trustMessage, setTrustMessage] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [missingReportLoading, setMissingReportLoading] = useState(false);
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseSearchResults, setCaseSearchResults] = useState([]);
  const [caseSearchLoading, setCaseSearchLoading] = useState(false);
  const [caseSearchStatus, setCaseSearchStatus] = useState("");
  const [hideReunitedCases, setHideReunitedCases] = useState(true);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) || tasks[0] || null,
    [tasks, selectedId]
  );

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const priorityDiff = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [tasks]);

  const openCounts = useMemo(() => {
    const critical = tasks.filter((task) => task.priority === "critical").length;
    const active = tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length;
    return { critical, active };
  }, [tasks]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await loadTasks();
      setTasks(result.tasks);
      setDemoMode(result.demoMode);
      setSelectedId((currentId) =>
        result.tasks.some((task) => task.id === currentId) ? currentId : result.tasks[0]?.id || null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToTaskChanges(refresh);
    return unsubscribe;
  }, [refresh]);

  async function changeStatus(task, nextStatus) {
    setError(null);
    try {
      const updated = await updateTaskStatus(task, nextStatus);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? { ...item, ...updated, status: nextStatus } : item))
      );
    } catch (err) {
      Alert.alert("Could not update task", err.message);
    }
  }

  async function getCurrentLocation() {
    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Location permission is required for this action.");
      }

      let position;
      try {
        position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          8000,
          "Current location timed out."
        );
      } catch (err) {
        position = await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 200 });
        if (!position) throw err;
      }

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        captured_at: new Date(position.timestamp).toISOString(),
      };
    } finally {
      setLocationLoading(false);
    }
  }

  async function sendEmergencyAlert() {
    setSubmitStatus("Sending SOS with your current location...");
    setError(null);
    setEmergencyLoading(true);
    try {
      const gpsLocation = await getCurrentLocation();
      const result = await submitEmergencyAlert({ gpsLocation });
      const message = result.demoMode
        ? "Demo SOS created with location."
        : "SOS sent to command center with location.";
      setSubmitStatus(message);
      Alert.alert("SOS Sent", message);
      await refresh();
    } catch (err) {
      setSubmitStatus("");
      setError(err.message);
      Alert.alert("Could not send SOS", err.message);
    } finally {
      setEmergencyLoading(false);
    }
  }

  async function createMissingReport() {
    if (!missingPersonName.trim() && !lastSeenLocation.trim() && !reportDetails.trim()) {
      Alert.alert("Details required", "Add name, last seen location, or short report details first.");
      return;
    }
    setSubmitStatus("Submitting missing report with current location...");
    setError(null);
    setMissingReportLoading(true);
    try {
      const gpsLocation = await getCurrentLocation();
      const result = await submitMissingReport({
        personName: missingPersonName,
        ageBand,
        gender,
        lastSeenLocation,
        details: reportDetails,
        gpsLocation,
      });
      setMissingPersonName("");
      setAgeBand("");
      setGender("");
      setLastSeenLocation("");
      setReportDetails("");
      const message = result.demoMode ? "Demo missing report saved with location." : "Missing report sent with location.";
      setSubmitStatus(message);
      Alert.alert("Report Submitted", message);
      await refresh();
    } catch (err) {
      setSubmitStatus("");
      setError(err.message);
      Alert.alert("Could not submit report", err.message);
    } finally {
      setMissingReportLoading(false);
    }
  }

  async function markSelectedFound(task) {
    setSubmitStatus("");
    setError(null);
    try {
      const gpsLocation = await getCurrentLocation();
      await reportTaskFound(task, gpsLocation);
      const remaining = tasks.filter((item) => item.id !== task.id);
      setTasks(remaining);
      setSelectedId(remaining[0]?.id || null);
      setSubmitStatus("Selected case reported found with current location.");
      await refresh();
    } catch (err) {
      Alert.alert("Could not report found", err.message);
    }
  }

  async function createTrustCheck() {
    if (!trustMessage.trim()) {
      Alert.alert("Message required", "Paste the booking or payment message first.");
      return;
    }
    setSubmitStatus("");
    setError(null);
    try {
      const result = await submitTrustCheck({ message: trustMessage });
      setTrustMessage("");
      setSubmitStatus(result.demoMode ? "Demo Trust Check saved on this phone." : "Trust Check sent for review.");
    } catch (err) {
      Alert.alert("Could not submit Trust Check", err.message);
    }
  }

  async function runCaseSearch(searchText = caseSearchQuery) {
    const query = searchText.trim();
    if (!query) {
      setCaseSearchResults([]);
      setCaseSearchStatus("Enter a name, location, age band, or reporting center.");
      return;
    }

    setCaseSearchLoading(true);
    setCaseSearchStatus("");
    setError(null);
    try {
      const result = await searchOfficialCases(query, 20);
      setCaseSearchResults(result.cases);
      setCaseSearchStatus(
        result.cases.length
          ? `${result.cases.length} official record${result.cases.length === 1 ? "" : "s"} found.`
          : "No official records found."
      );
      setDemoMode(result.demoMode);
    } catch (err) {
      setCaseSearchStatus("");
      setError(err.message);
      Alert.alert("Could not search official records", err.message);
    } finally {
      setCaseSearchLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Kumbh Saathi</Text>
          <Text style={styles.title}>Volunteer</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh tasks"
          accessibilityRole="button"
          style={[styles.headerIconButton, syncing && styles.headerIconButtonDisabled]}
          onPress={refresh}
          disabled={syncing}
        >
          <Text style={styles.headerIconText}>{syncing ? "..." : "↻"}</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard label="Assigned" value={openCounts.active} />
        <SummaryCard label="Critical" value={openCounts.critical} danger />
        <SummaryCard label="Volunteer" value={volunteerName} small />
      </View>

      {demoMode ? <StatusBanner kind="error" message="DEMO MODE ? sample data only. Reports are not sent to responders." /> : null}
      {error ? <StatusBanner kind="error" message={error} /> : null}
      {submitStatus ? <StatusBanner kind="success" message={submitStatus} /> : null}

      <View style={styles.tabs}>
        <TabButton label="Help" active={activeTab === "help"} onPress={() => setActiveTab("help")} />
        <TabButton label="Tasks" active={activeTab === "tasks"} onPress={() => setActiveTab("tasks")} />
        <TabButton label="Search" active={activeTab === "search"} onPress={() => setActiveTab("search")} />
      </View>

      {activeTab === "help" ? (
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={16}
        >
          <ReportScreen
            lastSeenLocation={lastSeenLocation}
            reportDetails={reportDetails}
            missingPersonName={missingPersonName}
            ageBand={ageBand}
            gender={gender}
            locationLoading={locationLoading}
            emergencyLoading={emergencyLoading}
            missingReportLoading={missingReportLoading}
            onNameChange={setMissingPersonName}
            onAgeBandChange={setAgeBand}
            onGenderChange={setGender}
            onLocationChange={setLastSeenLocation}
            onDetailsChange={setReportDetails}
            onEmergency={sendEmergencyAlert}
            onSubmitMissing={createMissingReport}
          />
        </KeyboardAvoidingView>
      ) : activeTab === "trust" ? (
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={16}
        >
          <TrustScreen message={trustMessage} onMessageChange={setTrustMessage} onSubmit={createTrustCheck} />
        </KeyboardAvoidingView>
      ) : activeTab === "search" ? (
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={16}
        >
          <OfficialCaseSearchScreen
            query={caseSearchQuery}
            results={caseSearchResults}
            loading={caseSearchLoading}
            status={caseSearchStatus}
            hideReunited={hideReunitedCases}
            onQueryChange={setCaseSearchQuery}
            onHideReunitedChange={setHideReunitedCases}
            onSearch={runCaseSearch}
          />
        </KeyboardAvoidingView>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={styles.muted}>Loading tasks...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.taskSelector}>
            <FlatList
              data={sortedTasks}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.taskList}
              renderItem={({ item }) => (
                <TaskChip
                  task={item}
                  selected={selectedTask?.id === item.id}
                  onPress={() => setSelectedId(item.id)}
                />
              )}
            />
          </View>

          <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
            {selectedTask ? (
              <TaskDetail
                task={selectedTask}
                locationLoading={locationLoading}
                onFound={markSelectedFound}
                onStatus={changeStatus}
              />
            ) : (
              <Text style={styles.muted}>No tasks assigned yet.</Text>
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatusBanner({ kind, message }) {
  return (
    <View style={[styles.statusBanner, kind === "error" ? styles.statusBannerError : styles.statusBannerSuccess]}>
      <Text style={[styles.statusBannerText, kind === "error" && styles.statusBannerErrorText]}>{message}</Text>
    </View>
  );
}

function ReportScreen({
  missingPersonName,
  ageBand,
  gender,
  lastSeenLocation,
  reportDetails,
  locationLoading,
  emergencyLoading,
  missingReportLoading,
  onNameChange,
  onAgeBandChange,
  onGenderChange,
  onLocationChange,
  onDetailsChange,
  onEmergency,
  onSubmitMissing,
}) {
  return (
    <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Emergency</Text>
        <Pressable
          style={[styles.actionButton, styles.dangerButton, emergencyLoading && styles.actionButtonDisabled]}
          onPress={onEmergency}
          disabled={emergencyLoading}
        >
          <Text style={styles.actionButtonText}>
            {emergencyLoading ? "Sending SOS..." : locationLoading ? "Getting Location..." : "Need Help Now"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Report Missing</Text>
        <TextInput
          style={styles.input}
          value={missingPersonName}
          onChangeText={onNameChange}
          placeholder="Missing person's name, if known"
          placeholderTextColor="#94a3b8"
          returnKeyType="next"
        />
        <View style={styles.inlineInputs}>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            value={ageBand}
            onChangeText={onAgeBandChange}
            placeholder="Age"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, styles.inlineInput]}
            value={gender}
            onChangeText={onGenderChange}
            placeholder="Gender"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
          />
        </View>
        <TextInput
          style={styles.input}
          value={lastSeenLocation}
          onChangeText={onLocationChange}
          placeholder="Last seen location or nearest landmark"
          placeholderTextColor="#94a3b8"
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          value={reportDetails}
          onChangeText={onDetailsChange}
          placeholder="Short details for the help desk"
          placeholderTextColor="#94a3b8"
          multiline
          textAlignVertical="top"
        />
        <View style={styles.actionGrid}>
          <Pressable
            style={[styles.actionButton, missingReportLoading && styles.actionButtonDisabled]}
            onPress={onSubmitMissing}
            disabled={missingReportLoading}
          >
            <Text style={styles.actionButtonText}>
              {missingReportLoading
                ? "Submitting Report..."
                : locationLoading
                  ? "Getting Location..."
                  : "Submit Missing Report"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function TrustScreen({ message, onMessageChange, onSubmit }) {
  return (
    <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Trust Check</Text>
        <TextInput
          style={[styles.input, styles.textAreaLarge]}
          value={message}
          onChangeText={onMessageChange}
          placeholder="Paste suspicious accommodation, payment, or booking message"
          placeholderTextColor="#94a3b8"
          multiline
          textAlignVertical="top"
        />
        <Pressable style={styles.refreshButton} onPress={onSubmit}>
          <Text style={styles.refreshText}>Send For Review</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function OfficialCaseSearchScreen({
  query,
  results,
  loading,
  status,
  hideReunited,
  onQueryChange,
  onHideReunitedChange,
  onSearch,
}) {
  const visibleResults = hideReunited
    ? results.filter((item) => String(item.status || "").toLowerCase() !== "reunited")
    : results;
  const hiddenCount = results.length - visibleResults.length;

  return (
    <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Official Case Search</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search name, location, age, center, status"
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
          onSubmitEditing={() => onSearch()}
        />
        <Pressable
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={() => onSearch()}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>{loading ? "Searching..." : "Search Official Records"}</Text>
        </Pressable>
        <Pressable
          style={styles.toggleRow}
          onPress={() => onHideReunitedChange(!hideReunited)}
          accessibilityRole="switch"
          accessibilityState={{ checked: hideReunited }}
        >
          <View style={[styles.toggleTrack, hideReunited && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, hideReunited && styles.toggleThumbActive]} />
          </View>
          <Text style={styles.toggleLabel}>Hide reunited cases</Text>
        </Pressable>
        {status ? <Text style={styles.searchStatus}>{status}</Text> : null}
        {hideReunited && hiddenCount > 0 ? (
          <Text style={styles.searchStatus}>{hiddenCount} reunited case{hiddenCount === 1 ? "" : "s"} hidden.</Text>
        ) : null}
      </View>

      {visibleResults.map((item) => (
        <OfficialCaseCard key={item.case_id} item={item} onCall={callPhoneNumber} />
      ))}
    </ScrollView>
  );
}

function OfficialCaseCard({ item, onCall }) {
  const flags = Array.isArray(item.risk_flags) ? item.risk_flags : [];
  const phoneNumber = callablePhoneNumber(item.reporter_mobile);
  return (
    <View style={styles.card}>
      <View style={styles.caseHeader}>
        <View style={styles.caseHeaderText}>
          <Text style={styles.taskPriority} numberOfLines={1}>
            {item.case_id || "Official record"}
          </Text>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {item.missing_person_name || "Unknown person"}
          </Text>
        </View>
        <Text style={styles.statusPill}>{item.status || "status unknown"}</Text>
      </View>

      <View style={styles.metaGrid}>
        <Meta label="Age" value={item.age_band || "unknown"} />
        <Meta label="Gender" value={item.gender || "unknown"} />
        <Meta label="Mobile" value={item.reporter_mobile || item.masked_mobile || "not available"} />
      </View>

      <Text style={styles.bodyText}>Last seen: {item.last_seen_location || "not provided"}</Text>
      <Text style={styles.bodyText}>Reporting center: {item.reporting_center || "not provided"}</Text>
      {item.language ? <Text style={styles.bodyText}>Language: {item.language}</Text> : null}
      {item.physical_description ? <Text style={styles.description}>{item.physical_description}</Text> : null}

      <View style={styles.flagRow}>
        {flags.map((flag) => (
          <Text key={`${item.case_id}-${flag}`} style={styles.flag}>
            {String(flag).replace(/_/g, " ")}
          </Text>
        ))}
      </View>
      {phoneNumber ? (
        <Pressable style={styles.callButton} onPress={() => onCall(item.reporter_mobile)}>
          <Text style={styles.callButtonText}>Call Reporter</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryCard({ label, value, danger, small }) {
  return (
    <View style={[styles.summaryCard, danger && styles.summaryDanger]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, small && styles.summarySmall]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TaskChip({ task, selected, onPress }) {
  const liveCase = task.live_case || {};
  return (
    <Pressable style={[styles.taskChip, selected && styles.taskChipSelected]} onPress={onPress}>
      <Text style={styles.taskPriority} numberOfLines={1}>
        {task.is_live_case_only ? "Live Case" : "Task"} / {sourceLabel(liveCase.source)} / {task.priority || "medium"}
      </Text>
      <Text style={styles.taskTitle} numberOfLines={2}>
        {task.title}
      </Text>
    </Pressable>
  );
}

function TaskDetail({ task, locationLoading, onFound, onStatus }) {
  const liveCase = task.live_case || {};
  const flags = liveCase.risk_flags || [];
  const descriptionLines = taskDescriptionLines(task.description);
  const rawMessage = liveCase.raw_report;
  const physicalDescription =
    liveCase.physical_description && !sameText(liveCase.physical_description, rawMessage)
      ? liveCase.physical_description
      : null;
  const coordinates = coordinatesFromCase(liveCase);
  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Task</Text>
        <Text style={styles.detailTitle}>{task.title}</Text>
        {descriptionLines.map((line) => (
          <Text key={line} style={styles.bodyText}>
            {line}
          </Text>
        ))}
        <View style={styles.metaGrid}>
          <Meta label="Source" value={sourceLabel(liveCase.source)} />
          <Meta label="Priority" value={task.priority || "medium"} danger={task.priority === "critical"} />
          <Meta label="Status" value={statusLabels[task.status] || task.status} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Case Context</Text>
        <Text style={styles.bodyText}>
          {liveCase.missing_person_name || "Unknown person"} / {liveCase.age_band || "age unknown"} /{" "}
          {liveCase.gender || "gender unknown"}
        </Text>
        <Text style={styles.bodyText}>Last seen: {liveCase.last_seen_location || "not provided"}</Text>
        <Text style={styles.bodyText}>Source detail: {liveCase.source_detail || "not provided"}</Text>
        {rawMessage ? <Text style={styles.description}>Message: {rawMessage}</Text> : null}
        {physicalDescription ? <Text style={styles.description}>{physicalDescription}</Text> : null}
        <View style={styles.flagRow}>
          {flags.map((flag) => (
            <Text key={flag} style={styles.flag}>
              {flag.replace(/_/g, " ")}
            </Text>
          ))}
        </View>
      </View>

      {coordinates ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Location Map</Text>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            scrollEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker coordinate={coordinates} title={sourceLabel(liveCase.source)} description={liveCase.last_seen_location || "Reported location"} />
          </MapView>
          <Text style={styles.mapCaption}>
            {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Update Status</Text>
        <Pressable
          style={[styles.actionButton, styles.foundButton]}
          onPress={() => onFound(task)}
          disabled={locationLoading}
        >
          <Text style={styles.actionButtonText}>
            {locationLoading ? "Getting Location..." : "Report This Case Found Here"}
          </Text>
        </Pressable>
        {task.is_live_case_only ? (
          <Text style={styles.muted}>Live case feed item. Use the found button above or create a task in command center.</Text>
        ) : (
          <View style={styles.statusGrid}>
            {taskStatuses.map((status) => (
              <Pressable
                key={status}
                style={[styles.statusButton, task.status === status && styles.statusButtonActive]}
                onPress={() => onStatus(task, status)}
              >
                <Text style={[styles.statusButtonText, task.status === status && styles.statusButtonTextActive]}>
                  {statusLabels[status]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Meta({ label, value, danger }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, danger && styles.metaDanger]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  eyebrow: {
    color: "#ea580c",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 26,
    fontWeight: "800",
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  headerIconButtonDisabled: {
    opacity: 0.6,
  },
  headerIconText: {
    color: "#ea580c",
    fontFamily: appFont,
    fontSize: 24,
    fontWeight: "900",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fff7f7",
  },
  summaryLabel: {
    color: "#64748b",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 2,
  },
  summarySmall: {
    fontSize: 14,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  tabButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  tabButtonActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  tabText: {
    color: "#334155",
    fontFamily: appFont,
    fontWeight: "800",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 14,
    paddingBottom: 120,
  },
  keyboardArea: {
    flex: 1,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 10,
  },
  inlineInput: {
    flex: 1,
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  textAreaLarge: {
    minHeight: 170,
    textAlignVertical: "top",
  },
  actionGrid: {
    gap: 10,
  },
  actionButton: {
    backgroundColor: "#ea580c",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 13,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  dangerButton: {
    backgroundColor: "#b91c1c",
  },
  foundButton: {
    backgroundColor: "#15803d",
    marginBottom: 12,
  },
  actionButtonText: {
    color: "#ffffff",
    fontFamily: appFont,
    fontWeight: "900",
  },
  content: {
    flex: 1,
  },
  taskList: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 10,
  },
  taskSelector: {
    flexGrow: 0,
    height: 90,
  },
  taskChip: {
    width: 154,
    height: 76,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 9,
  },
  taskChipSelected: {
    borderColor: "#ea580c",
    borderWidth: 2,
  },
  taskPriority: {
    color: "#b45309",
    fontFamily: appFont,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  taskTitle: {
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  detail: {
    flex: 1,
  },
  detailContent: {
    padding: 14,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    color: "#ea580c",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  detailTitle: {
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  bodyText: {
    color: "#334155",
    fontFamily: appFont,
    fontSize: 15,
    lineHeight: 22,
  },
  description: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    color: "#334155",
    fontFamily: appFont,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    padding: 10,
  },
  searchStatus: {
    color: "#64748b",
    fontFamily: appFont,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  toggleTrack: {
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 50,
  },
  toggleTrackActive: {
    backgroundColor: "#ea580c",
  },
  toggleThumb: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 22,
    width: 22,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  toggleLabel: {
    color: "#334155",
    fontFamily: appFont,
    fontSize: 14,
    fontWeight: "800",
  },
  caseHeader: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  caseHeaderText: {
    flex: 1,
  },
  statusPill: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    color: "#334155",
    fontFamily: appFont,
    fontSize: 11,
    fontWeight: "900",
    maxWidth: 120,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: "uppercase",
  },
  callButton: {
    alignItems: "center",
    backgroundColor: "#15803d",
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 12,
  },
  callButtonText: {
    color: "#ffffff",
    fontFamily: appFont,
    fontWeight: "900",
  },
  map: {
    height: 180,
    borderRadius: 8,
    marginTop: 4,
    overflow: "hidden",
  },
  mapCaption: {
    color: "#64748b",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    color: "#64748b",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "700",
  },
  metaValue: {
    color: "#0f172a",
    fontFamily: appFont,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  metaDanger: {
    color: "#dc2626",
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  flag: {
    backgroundColor: "#fef3c7",
    borderRadius: 999,
    color: "#92400e",
    fontFamily: appFont,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusButtonActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  statusButtonText: {
    color: "#334155",
    fontFamily: appFont,
    fontWeight: "800",
  },
  statusButtonTextActive: {
    color: "#ffffff",
  },
  statusBanner: {
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusBannerSuccess: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  statusBannerError: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  statusBannerText: {
    color: "#166534",
    fontFamily: appFont,
    fontWeight: "800",
  },
  statusBannerErrorText: {
    color: "#b91c1c",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  muted: {
    color: "#64748b",
    fontFamily: appFont,
  },
  refreshButton: {
    backgroundColor: "#ea580c",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 13,
  },
  refreshText: {
    color: "#ffffff",
    fontFamily: appFont,
    fontWeight: "900",
  },
});
