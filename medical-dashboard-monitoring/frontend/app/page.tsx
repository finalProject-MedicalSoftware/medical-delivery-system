'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center p-8 txt-sec text-xs">
      Mengarahkan ke Dashboard NEVO...
    </div>
  );
}
