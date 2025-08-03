import LiveSyncToggle from "./Features/LiveSync/toggle";

export const configurableFeatures = {
  experimental_live_file_sync: {
    title: "experimental_features.live-document-sync.menu",
    component: LiveSyncToggle,
    key: "experimental_live_file_sync",
  },
};
