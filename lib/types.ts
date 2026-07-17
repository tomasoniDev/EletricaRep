export type Machine = {
  id: string;
  code: string | null;
  model: string | null;
  client: string | null;
  unit_city: string | null;
  serial: string | null;
  description: string | null;
  manufacture_month: string | null;
  mechanical_list: string | null;
  software_code: string | null;
  ip_range: string | null;
  vm: string | null;
  software_version: string | null;
  access_method: string | null;
  remote_access: "SINEMA" | "VNC" | "Sem acesso remoto" | null;
  vnc_ip: string | null;
  vnc_user: string | null;
  vnc_password: string | null;
  vnc_vm_password: string | null;
  vnc_notes: string | null;
  sinema_url: string | null;
  sinema_user: string | null;
  sinema_password: string | null;
  sinema_notes: string | null;
  support_contract_active: boolean | null;
  support_contract_type: string | null;
  support_contract_until: string | null;
  created_at: string;
  updated_at: string;
  machine_emails?: MachineEmail[];
  machine_components?: MachineComponent[];
  service_records?: ServiceRecord[];
};

export type MachineComponent = {
  id: string;
  machine_id: string;
  machine_name: string | null;
  electrical_project: string | null;
  project_folder_link: string | null;
  ip_range: string | null;
  created_at: string;
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

export type UserRole = "Admin" | "Diretoria" | "Coordenador" | "Engenharia" | "Montagem" | "Comercial";

export type AuthorizedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  remote_access_allowed: boolean | null;
  created_at: string;
  updated_at: string;
};

export type ChatConversation = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  customer_company: string | null;
  contact_id: string | null;
  machine_id: string | null;
  machine_code: string | null;
  machine_serial: string | null;
  identification_status: "pending_customer" | "pending_machine" | "identified" | null;
  status: "open" | "assigned" | "closed";
  assigned_to: string | null;
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  closed_by: string | null;
  closed_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  chat_messages?: ChatMessage[];
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | "system";
  body: string;
  message_type: "text" | "image" | "video" | "audio" | "document" | "unknown" | null;
  media_id: string | null;
  media_mime_type: string | null;
  media_sha256: string | null;
  media_filename: string | null;
  media_caption: string | null;
  whatsapp_message_id: string | null;
  sender_phone: string | null;
  sender_name: string | null;
  sender_email: string | null;
  created_by: string | null;
  created_at: string;
};

export type TravelSchedule = {
  id: string;
  start_date: string;
  end_date: string;
  code: string | null;
  client: string | null;
  technicians: string | null;
  status: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportContract = {
  id: string;
  machine_id: string | null;
  code: string | null;
  client: string | null;
  serial: string | null;
  contract_type: string | null;
  status: "Ativo" | "Inativo" | "Em negociação" | null;
  active: boolean | null;
  support_contract_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type ServiceRecord = {
  id: string;
  machine_id: string;
  technician_id: string | null;
  technician_name: string;
  technician_email: string | null;
  service_type: "Acesso remoto" | "Visita técnica" | null;
  service_date: string;
  service_start: string | null;
  service_end: string | null;
  equipment: string | null;
  issue_summary: string | null;
  request: string;
  diagnosis: string;
  service_done: string;
  observations: string | null;
  customer_name: string | null;
  customer_signature: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
