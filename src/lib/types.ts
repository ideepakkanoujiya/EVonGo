
import type { Timestamp } from 'firebase/firestore';

export type ChargingStation = {
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
  avatarUrl: string;
  title: string;
  content: string;
  timestamp: Timestamp | Date | string; // Allow multiple types for flexibility
  userId: string;
  replies: number;
};
