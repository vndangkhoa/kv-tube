'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function LibraryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/feed/history');
  }, [router]);

  return <LoadingSpinner fullScreen text="Redirecting to History..." />;
}
