import { route } from '../../src/index';

// Public route - Get all users
export const getUsers = route(
  {
    method: 'GET',
    path: '/users',
    expose: true,
    cache: 60, // Cache for 60 seconds
  },
  async (req) => {
    return {
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ],
    };
  }
);

// Protected route - Get user profile
export const getUserProfile = route(
  {
    method: 'GET',
    path: '/users/profile',
    expose: true,
    auth: true, // Requires authentication
  },
  async (req) => {
    return {
      user: req.authUser,
      profile: {
        bio: 'Software developer',
        joined: '2024-01-01',
      },
    };
  }
);

// Public route with params - Get user by ID
export const getUserById = route(
  {
    method: 'GET',
    path: '/users/:id',
    expose: true,
    cache: { ttl: 30 }, // Cache for 30 seconds
  },
  async (req) => {
    const { id } = req.params;
    return {
      user: {
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
      },
    };
  }
);

// Protected route - Create user
export const createUser = route(
  {
    method: 'POST',
    path: '/users',
    expose: true,
    auth: true,
  },
  async (req) => {
    const { name, email } = req.content;

    return {
      success: true,
      user: {
        id: Date.now(),
        name,
        email,
        createdBy: req.authUser.id,
      },
    };
  }
);

// Protected route - Update user
export const updateUser = route(
  {
    method: 'PUT',
    path: '/users/:id',
    expose: true,
    auth: true,
  },
  async (req) => {
    const { id } = req.params;
    const updates = req.content;

    return {
      success: true,
      user: {
        id,
        ...updates,
        updatedBy: req.authUser.id,
        updatedAt: new Date().toISOString(),
      },
    };
  }
);

// Protected route - Delete user
export const deleteUser = route(
  {
    method: 'DELETE',
    path: '/users/:id',
    expose: true,
    auth: true,
  },
  async (req) => {
    const { id } = req.params;

    return {
      success: true,
      message: `User ${id} deleted by ${req.authUser.id}`,
    };
  }
);
