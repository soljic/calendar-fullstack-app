import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const user = await authService.getUser(); // dohvaća iz /auth/me
        console.log('Authenticated as:', user);
        navigate('/dashboard');
      } catch (error) {
        console.error('User not authenticated:', error);
        navigate('/login?error=auth_failed');
      }
    };

    checkUser();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <h2 className="mt-6 text-xl font-semibold text-gray-900">
            Finalizing authentication...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we verify your session.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
         