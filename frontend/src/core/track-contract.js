// Canonical product vocabulary. Legacy values are accepted only by the backend
// adapter; frontend writes and queries these values exclusively.
export const TRACKS = Object.freeze({
  COMPETITIVE: "competitive",
  ALGORITHM_ENGINEERING: "algorithm-engineering",
});

export const TRACK_LABELS = Object.freeze({
  [TRACKS.COMPETITIVE]: "Luyện thi",
  [TRACKS.ALGORITHM_ENGINEERING]: "Thuật toán & ứng dụng",
});
