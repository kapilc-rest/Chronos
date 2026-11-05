export interface UserRecord {
  username: string;
  password: string; // Stored client-side in localStorage for user accounts
  createdAt: string;
}

const USERS_STORAGE_KEY = 'chronos_registered_users_v1';
const CURRENT_USER_KEY = 'chronos_auth_user';

// Initialize default admin user if no users are registered yet
export function getRegisteredUsers(): Record<string, UserRecord> {
  if (typeof window === 'undefined') return {};
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  if (!stored) {
    const initialUsers: Record<string, UserRecord> = {
      admin: {
        username: 'admin',
        password: 'password',
        createdAt: new Date().toISOString(),
      },
    };
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initialUsers));
    return initialUsers;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

export function saveRegisteredUsers(users: Record<string, UserRecord>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function registerUser(usernameRaw: string, passwordRaw: string): { success: boolean; error?: string; user?: string } {
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  if (!username) {
    return { success: false, error: 'Please enter a username or email' };
  }
  if (username.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long' };
  }
  if (!password) {
    return { success: false, error: 'Please enter a password' };
  }
  if (password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters long' };
  }

  const users = getRegisteredUsers();

  if (users[username]) {
    return { success: false, error: 'Username already taken. Please choose another username or sign in.' };
  }

  users[username] = {
    username,
    password,
    createdAt: new Date().toISOString(),
  };

  saveRegisteredUsers(users);
  localStorage.setItem(CURRENT_USER_KEY, username);

  return { success: true, user: username };
}

export function authenticateUser(usernameRaw: string, passwordRaw: string): { success: boolean; error?: string; user?: string } {
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  if (!username || !password) {
    return { success: false, error: 'Please enter both username and password' };
  }

  const users = getRegisteredUsers();
  const record = users[username];

  if (!record || record.password !== password) {
    return { success: false, error: 'Invalid username or password' };
  }

  localStorage.setItem(CURRENT_USER_KEY, username);
  return { success: true, user: username };
}

export function getCurrentUser(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function logoutUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CURRENT_USER_KEY);
}
