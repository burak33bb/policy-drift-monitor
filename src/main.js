import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import {
  CONTRACT_ADDRESS,
  EXPLORER_BASE_URL,
  NETWORK_CHAIN_ID,
  NETWORK_LABEL,
} from "./config.js";
import {
  readableWalletError,
  requestAccountPicker,
  revokeAccountPermission,
  switchToStudionet,
} from "./wallet.js";
import "./styles.css";

window.policyDriftMonitorReady = true;

const readClient = createClient({ chain: studionet });
let writeClient = null;
let walletAddress = "";
let latestReport = "";
let activity = loadActivity();

const nodes = {
  walletState: document.querySelector("#wallet-state"),
  connectWallet: document.querySelector("#connect-wallet"),
  disconnectWallet: document.querySelector("#disconnect-wallet"),
  checkPolicy: document.querySelector("#check-policy"),
  readLatest: document.querySelector("#read-latest"),
  statusPill: document.querySelector("#status-pill"),
  severityLabel: document.querySelector("#severity-label"),
  confidenceLabel: document.querySelector("#confidence-label"),
  summaryText: document.querySelector("#summary-text"),
  contractAddress: document.querySelector("#contract-address"),
  networkLabel: document.querySelector("#network-label"),
  contractLink: document.querySelector("#contract-link"),
  policyUrl: document.querySelector("#policy-url"),
  baselineHash: document.querySelector("#baseline-hash"),
  watchName: document.querySelector("#watch-name"),
  resultBand: document.querySelector("#result-band"),
  txTitle: document.querySelector("#tx-title"),
  txOutput: document.querySelector("#tx-output"),
  txLink: document.querySelector("#tx-link"),
  rawOutput: document.querySelector("#raw-output"),
  copyReport: document.querySelector("#copy-report"),
  activityList: document.querySelector("#activity-list"),
  clearActivity: document.querySelector("#clear-activity"),
};

nodes.connectWallet.addEventListener("click", connectWallet);
nodes.disconnectWallet.addEventListener("click", disconnectWallet);
nodes.checkPolicy.addEventListener("click", checkPolicy);
nodes.readLatest.addEventListener("click", readLatestCheck);
nodes.copyReport.addEventListener("click", copyLatestReport);
nodes.clearActivity.addEventListener("click", clearActivity);

initializeUi();

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", handleAccountsChanged);
  window.ethereum.on?.("chainChanged", handleChainChanged);
  syncExistingWallet();
}

readWatch();
readLatestCheck({ silent: true });

async function connectWallet() {
  try {
    if (!window.ethereum) {
      setTransactionState("Wallet missing", "Install MetaMask or another EIP-1193 wallet.");
      return false;
    }

    setTransactionState("Network check", `Approve ${NETWORK_LABEL} in your wallet.`);
    await switchToStudionet(window.ethereum);

    if (walletAddress) {
      setTransactionState("Choose wallet", "Approve account reset, then pick the wallet to use.");
      await revokeAccountPermission(window.ethereum);
    }

    await requestAccountPicker(window.ethereum);
    const [address] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    setConnectedWallet(address);
    return true;
  } catch (error) {
    setDisconnectedWallet();
    setTransactionState("Wallet blocked", readableWalletError(error));
    return false;
  }
}

async function disconnectWallet() {
  if (window.ethereum) {
    try {
      await revokeAccountPermission(window.ethereum);
    } catch {
    }
  }
  setDisconnectedWallet();
  setTransactionState("Disconnected", "Wallet cleared in this app. Connect again to pick another account.");
}

async function checkPolicy() {
  try {
    if (!writeClient) {
      const connected = await connectWallet();
      if (!connected) return;
    }

    nodes.checkPolicy.disabled = true;
    setStatus("Signing", "muted");
    setTransactionState("Wallet signing", "Confirm check_policy() in your wallet.");

    const hash = await writeClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "check_policy",
      args: [],
      value: BigInt(0),
    });

    const txUrl = `${EXPLORER_BASE_URL}/tx/${hash}`;
    showTxLink(txUrl);
    setTransactionState("Submitted", `Transaction hash:\n${hash}`);
    addActivity({
      title: "check_policy submitted",
      status: "Submitted",
      hash,
      createdAt: new Date().toISOString(),
    });

    const receipt = await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      fullTransaction: false,
    });

    setTransactionState("Accepted", JSON.stringify(receipt, formatBigInt, 2));
    updateActivity(hash, "Accepted");
    await readLatestCheck();
  } catch (error) {
    setStatus("Action failed", "danger");
    setTransactionState("Action failed", error.message);
  } finally {
    nodes.checkPolicy.disabled = false;
  }
}

async function readWatch() {
  try {
    const watch = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_watch",
      args: [],
      stateStatus: "accepted",
    });
    renderWatch(watch || {});
  } catch (error) {
    nodes.baselineHash.textContent = "Read failed";
    nodes.summaryText.textContent = error.message;
  }
}

async function readLatestCheck(options = {}) {
  try {
    if (!options.silent) {
      setStatus("Reading", "muted");
    }

    const result = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_latest_check",
      args: [],
      stateStatus: "accepted",
    });

    const report = normalizeReport(result);
    renderLatest(report);
  } catch (error) {
    if (!options.silent) {
      setStatus("Read failed", "danger");
      nodes.rawOutput.textContent = error.message;
    }
  }
}

async function copyLatestReport() {
  if (!latestReport) return;
  await navigator.clipboard.writeText(latestReport);
  nodes.copyReport.textContent = "Copied";
  window.setTimeout(() => {
    nodes.copyReport.textContent = "Copy";
  }, 1100);
}

async function syncExistingWallet() {
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) {
      setConnectedWallet(accounts[0]);
    }
  } catch {
    setDisconnectedWallet();
  }
}

function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    setDisconnectedWallet();
    return;
  }
  setConnectedWallet(accounts[0]);
}

function handleChainChanged() {
  if (!walletAddress || !window.ethereum) return;
  switchToStudionet(window.ethereum).catch(() => {
    setStatus("Wrong network", "danger");
    setTransactionState("Wrong network", `Switch back to ${NETWORK_LABEL}.`);
  });
}

function setConnectedWallet(address) {
  walletAddress = address;
  writeClient = createClient({
    chain: studionet,
    account: walletAddress,
    provider: window.ethereum,
  });
  nodes.walletState.textContent = shortAddress(walletAddress);
  nodes.walletState.classList.add("connected");
  nodes.connectWallet.textContent = "Change wallet";
  nodes.disconnectWallet.hidden = false;
  setTransactionState("Wallet ready", `Connected on ${NETWORK_LABEL}.`);
}

function setDisconnectedWallet() {
  walletAddress = "";
  writeClient = null;
  nodes.walletState.textContent = "Not connected";
  nodes.walletState.classList.remove("connected");
  nodes.connectWallet.textContent = "Connect wallet";
  nodes.disconnectWallet.hidden = true;
}

function initializeUi() {
  nodes.contractAddress.textContent = CONTRACT_ADDRESS;
  nodes.networkLabel.textContent = `${NETWORK_LABEL} ${NETWORK_CHAIN_ID}`;
  nodes.contractLink.href = `${EXPLORER_BASE_URL}/address/${CONTRACT_ADDRESS}`;
  renderActivity();
}

function renderWatch(watch) {
  nodes.watchName.textContent = watch.watch_name || "PolicyDriftSentinel";
  nodes.policyUrl.href = watch.policy_url || "https://docs.genlayer.com/";
  nodes.policyUrl.textContent = watch.policy_url || "https://docs.genlayer.com/";
  nodes.baselineHash.textContent = String(watch.baseline_hash || "No baseline read");
}

function renderLatest(report) {
  latestReport = JSON.stringify(report, formatBigInt, 2);
  nodes.rawOutput.textContent = latestReport;
  nodes.copyReport.disabled = false;

  if (!report || Object.keys(report).length === 0) {
    setStatus("No checks yet", "muted");
    nodes.severityLabel.textContent = "No record";
    nodes.confidenceLabel.textContent = "Submit the first contract check.";
    nodes.summaryText.textContent =
      "The contract is deployed and readable, but no accepted check is stored yet.";
    nodes.resultBand.dataset.severity = "empty";
    return;
  }

  const drift = report.drift || {};
  const severity = drift.severity || "UNKNOWN";
  const confidence = drift.confidence;
  nodes.severityLabel.textContent = severity;
  nodes.confidenceLabel.textContent =
    confidence === undefined ? "Confidence not returned" : `Confidence ${confidence}%`;
  nodes.summaryText.textContent = drift.summary || "Contract returned a stored drift record.";
  nodes.resultBand.dataset.severity = severity.toLowerCase();
  setStatus("Contract read", severity === "HIGH" ? "danger" : "ok");

  if (report.id) {
    addActivity({
      title: `latest check #${report.id}`,
      status: severity,
      hash: "",
      createdAt: report.created_at || new Date().toISOString(),
    });
  }
}

function setStatus(label, tone) {
  nodes.statusPill.textContent = label;
  nodes.statusPill.dataset.tone = tone;
}

function setTransactionState(title, body) {
  nodes.txTitle.textContent = title;
  nodes.txOutput.textContent = body;
}

function showTxLink(url) {
  nodes.txLink.href = url;
  nodes.txLink.hidden = false;
}

function addActivity(entry) {
  const key = entry.hash || `${entry.title}:${entry.createdAt}`;
  activity = [
    entry,
    ...activity.filter((item) => (item.hash || `${item.title}:${item.createdAt}`) !== key),
  ].slice(0, 6);
  saveActivity();
  renderActivity();
}

function updateActivity(hash, status) {
  activity = activity.map((entry) =>
    entry.hash === hash ? { ...entry, status } : entry,
  );
  saveActivity();
  renderActivity();
}

function renderActivity() {
  if (!activity.length) {
    nodes.activityList.innerHTML = '<div class="empty-state">No local activity yet.</div>';
    return;
  }
  nodes.activityList.replaceChildren(
    ...activity.map((entry) => {
      const item = document.createElement("div");
      item.className = "activity-item";
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const meta = document.createElement("span");
      meta.textContent = `${entry.status} · ${new Date(entry.createdAt).toLocaleString()}`;
      item.append(title, meta);
      if (entry.hash) {
        const link = document.createElement("a");
        link.href = `${EXPLORER_BASE_URL}/tx/${entry.hash}`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Explorer";
        item.append(link);
      }
      return item;
    }),
  );
}

function clearActivity() {
  activity = [];
  saveActivity();
  renderActivity();
}

function loadActivity() {
  try {
    return JSON.parse(localStorage.getItem("policy-drift-monitor-activity") || "[]");
  } catch {
    return [];
  }
}

function saveActivity() {
  localStorage.setItem("policy-drift-monitor-activity", JSON.stringify(activity));
}

function normalizeReport(result) {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return { drift: { severity: "UNKNOWN", summary: result } };
    }
  }
  return result || {};
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBigInt(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
