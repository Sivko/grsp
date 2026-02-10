export interface MeshCallbacks {
  onPeerJoined: (peerId: string, dataChannel: RTCDataChannel) => void;
  onPeerLeft: (peerId: string) => void;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onSignalingSend?: (toPeerId: string, payload: { type: "offer"; sdp: RTCSessionDescriptionInit } | { type: "answer"; sdp: RTCSessionDescriptionInit } | { type: "ice"; candidate: RTCIceCandidateInit }) => void;
}
