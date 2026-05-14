export type Machine = {
  id: string;
  code: string;
  model: string;
  client: string;
  unit_city: string | null;
  serial: string | null;
  software_version: string | null;
  access_method: string | null;
  created_at: string;
  updated_at: string;
  machine_emails?: MachineEmail[];
  service_records?: ServiceRecord[];
};

export type MachineEmail = {
  id: string;
  machine_id: string;
  email: string;
  created_at: string;
};

export type Technician = {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceRecord = {
  id: string;
  machine_id: string;
  technician_id: string | null;
  technician_name: string;
  technician_email: string | null;
  service_date: string;
  equipment: string | null;
  request: string;
  diagnosis: string;
  service_done: string;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
