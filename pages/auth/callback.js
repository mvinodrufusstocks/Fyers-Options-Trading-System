import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AuthCallback() {
  const router = useRouter();
  
  useEffect(() => {
    const query = window.location.search;
    router.push(`/api/auth/callback${query}`);
  }, []);
  
  return <div>Authenticating...</div>;
}
