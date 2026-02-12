import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateVmRequest, type UpdateVmRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ============================================
// HOST STATS
// ============================================

export function useHostStats() {
  return useQuery({
    queryKey: [api.stats.host.path],
    queryFn: async () => {
      const res = await fetch(api.stats.host.path);
      if (!res.ok) throw new Error("Failed to fetch host stats");
      const data = await res.json();
      return api.stats.host.responses[200].parse(data) as any;
    },
    refetchInterval: 5000, // Poll every 5s for realtime stats
  });
}

// ============================================
// VM CRUD
// ============================================

export function useVms() {
  return useQuery({
    queryKey: [api.vms.list.path],
    queryFn: async () => {
      const res = await fetch(api.vms.list.path);
      if (!res.ok) throw new Error("Failed to fetch VMs");
      return api.vms.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll for status changes
  });
}

export function useVm(id: number) {
  return useQuery({
    queryKey: [api.vms.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.vms.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch VM");
      return api.vms.get.responses[200].parse(await res.json());
    },
    refetchInterval: 2000, // Faster polling for detail view
  });
}

export function useCreateVm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateVmRequest) => {
      const res = await fetch(api.vms.create.path, {
        method: api.vms.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create VM");
      }
      return api.vms.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vms.list.path] });
      toast({ title: "VM Created", description: "Virtual machine provisioned successfully." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateVm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateVmRequest) => {
      const url = buildUrl(api.vms.update.path, { id });
      const res = await fetch(url, {
        method: api.vms.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update VM");
      }
      return api.vms.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.vms.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.vms.get.path, id] });
      toast({ title: "VM Updated", description: "Configuration saved." });
    },
    onError: (err) => {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteVm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.vms.delete.path, { id });
      const res = await fetch(url, { method: api.vms.delete.method });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to delete VM");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.vms.list.path] });
      toast({ title: "VM Deleted", description: "Virtual machine removed successfully." });
    },
  });
}

// ============================================
// ACTIONS (Start, Stop, Restart)
// ============================================

export function useVmAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'start' | 'stop' | 'restart' }) => {
      const url = buildUrl(api.vms.action.path, { id });
      const res = await fetch(url, {
        method: api.vms.action.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `Failed to ${action} VM`);
      }
      return api.vms.action.responses[200].parse(await res.json());
    },
    onSuccess: (data, { action, id }) => {
      queryClient.invalidateQueries({ queryKey: [api.vms.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.vms.get.path, id] });
      toast({ 
        title: `VM ${action.charAt(0).toUpperCase() + action.slice(1)}ed`, 
        description: `Command sent successfully.` 
      });
    },
    onError: (err) => {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    },
  });
}
