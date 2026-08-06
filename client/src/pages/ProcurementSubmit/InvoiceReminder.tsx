import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface InvoiceReminderProps {
  message: string;
}

const InvoiceReminder: React.FC<InvoiceReminderProps> = ({ message }) => (
  <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
    <span>{message}</span>
  </div>
);

export default InvoiceReminder;
