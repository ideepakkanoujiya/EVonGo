export type EVChargingStation = {
  id: string;
  name: string;
  address: string;
  distance: string;
  connectors: {
    type: string;
    speed: string;
    available: number;
    total: number;
  }[];
  isAvailable: boolean;
};

export type ServiceCenter = {
  id: string;
  name: string;
  address: string;
  rating: number;
  phone: string;
  mapsUrl: string;
};

export type ServiceRecord = {
  id: string;
  date: string;
  service: string;
  cost: number;
  notes: string;
};

export type CommunityPost = {
  id: string;
  author: string;
  avatarUrl?: string;
  title: string;
  content: string;
  timestamp: Date | string | null;
  userId: string;
  replies: number;
  likes: number;
  likedByUserIds?: string[];
};

export type CommunityReply = {
  id: string;
  postId: string;
  author: string;
  avatarUrl?: string;
  content: string;
  timestamp: Date | string | null;
  userId: string;
};
