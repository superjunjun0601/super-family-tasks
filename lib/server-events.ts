import type { ServerEventType } from "@/lib/server-event-types";

type ServerEvent = {
  id: number;
  type: ServerEventType;
};

type Listener = (event: ServerEvent) => void;

const globalEventBus = globalThis as typeof globalThis & {
  __superFamilyEventBus?: {
    listeners: Set<Listener>;
    nextId: number;
  };
};

const eventBus =
  globalEventBus.__superFamilyEventBus ??
  (globalEventBus.__superFamilyEventBus = {
    listeners: new Set<Listener>(),
    nextId: 1
  });

export function subscribeToServerEvents(listener: Listener) {
  eventBus.listeners.add(listener);
  return () => {
    eventBus.listeners.delete(listener);
  };
}

export function publishServerEvent(type: ServerEventType) {
  const event = {
    id: eventBus.nextId,
    type
  };
  eventBus.nextId += 1;
  eventBus.listeners.forEach((listener) => listener(event));
}
