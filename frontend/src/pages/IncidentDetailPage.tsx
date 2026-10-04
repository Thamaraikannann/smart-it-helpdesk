import { useParams } from 'react-router-dom';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Incident Detail</h1>
      <p className="text-gray-500">Incident <span className="font-mono">{id}</span> detail coming soon.</p>
    </div>
  );
}
