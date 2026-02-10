export interface PeerDescriptor {
  peerId: string;
  displayName: string;
  sdp?: RTCSessionDescriptionInit;
  iceCandidates?: RTCIceCandidateInit[];
}

export type DiscoveryMessage =
  | { type: "join"; channel: string }
  | { type: "descriptor"; descriptor: PeerDescriptor }
  | { type: "webrtc"; from: string; to: string; payload: RTCSignalingPayload };

export type RTCSignalingPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };
