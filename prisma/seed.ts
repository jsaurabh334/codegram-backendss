import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create sample users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { githubId: 'sample-user-1' },
      update: {},
      create: {
        githubId: 'sample-user-1',
        username: 'johndoe',
        email: 'john@example.com',
        name: 'John Doe',
        bio: 'Full-stack developer passionate about React and Node.js',
        avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
        githubUrl: 'https://github.com/johndoe',
        website: 'https://johndoe.dev',
        location: 'San Francisco, CA',
        techStack: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      },
    }),
    prisma.user.upsert({
      where: { githubId: 'sample-user-2' },
      update: {},
      create: {
        githubId: 'sample-user-2',
        username: 'janesmith',
        email: 'jane@example.com',
        name: 'Jane Smith',
        bio: 'Frontend developer and UI/UX enthusiast',
        avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
        githubUrl: 'https://github.com/janesmith',
        location: 'New York, NY',
        techStack: ['JavaScript', 'Vue.js', 'CSS', 'Figma', 'TailwindCSS'],
      },
    }),
    prisma.user.upsert({
      where: { githubId: 'sample-user-3' },
      update: {},
      create: {
        githubId: 'sample-user-3',
        username: 'mikejohnson',
        email: 'mike@example.com',
        name: 'Mike Johnson',
        bio: 'Backend engineer specializing in microservices',
        avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=150',
        githubUrl: 'https://github.com/mikejohnson',
        location: 'Austin, TX',
        techStack: ['Python', 'Django', 'Docker', 'Kubernetes', 'AWS'],
      },
    }),
  ]);

  console.log('✅ Created sample users');

  // Create sample snippets
  const snippets = await Promise.all([
    prisma.snippet.create({
      data: {
        title: 'React Custom Hook for API Calls',
        description: 'A reusable custom hook for handling API requests with loading states',
        content: `import { useState, useEffect } from 'react';

export function useApi(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}`,
        language: 'javascript',
        tags: ['React', 'Hooks', 'API', 'JavaScript'],
        authorId: users[0].id,
      },
    }),
    prisma.snippet.create({
      data: {
        title: 'CSS Flexbox Centering',
        description: 'Perfect centering with flexbox - both horizontal and vertical',
        content: `.center-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.centered-content {
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}`,
        language: 'css',
        tags: ['CSS', 'Flexbox', 'Layout', 'Centering'],
        authorId: users[1].id,
      },
    }),
    prisma.snippet.create({
      data: {
        title: 'Python Decorator for Timing Functions',
        description: 'A decorator to measure execution time of functions',
        content: `import time
from functools import wraps

def timer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)
    return "Done!"

# Usage
result = slow_function()  # Prints: slow_function took 1.0001 seconds`,
        language: 'python',
        tags: ['Python', 'Decorators', 'Performance', 'Timing'],
        authorId: users[2].id,
      },
    }),
  ]);

  console.log('✅ Created sample snippets');

  // Create sample docs
  const docs = await Promise.all([
    prisma.doc.create({
      data: {
        title: 'Getting Started with React Hooks',
        description: 'A comprehensive guide to understanding and using React Hooks',
        content: `# Getting Started with React Hooks

React Hooks were introduced in React 16.8 and have revolutionized how we write React components. This guide will walk you through the most commonly used hooks.

## useState Hook

The \`useState\` hook allows you to add state to functional components:

\`\`\`javascript
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
\`\`\`

## useEffect Hook

The \`useEffect\` hook lets you perform side effects in functional components:

\`\`\`javascript
import React, { useState, useEffect } from 'react';

function Example() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = \`You clicked \${count} times\`;
  });

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
\`\`\`

## Best Practices

1. Always use hooks at the top level of your React function
2. Don't call hooks inside loops, conditions, or nested functions
3. Use the ESLint plugin for hooks to catch common mistakes
4. Consider creating custom hooks for reusable stateful logic

Happy coding! 🚀`,
        coverImage: 'https://images.pexels.com/photos/11035380/pexels-photo-11035380.jpeg?auto=compress&cs=tinysrgb&w=800',
        tags: ['React', 'Hooks', 'JavaScript', 'Tutorial'],
        authorId: users[0].id,
      },
    }),
  ]);

  console.log('✅ Created sample docs');

  // Create sample bugs
  const bugs = await Promise.all([
    prisma.bug.create({
      data: {
        title: 'CSS Grid not working in Safari',
        description: 'Grid layout breaks in Safari browser, items overlap',
        content: `I'm having trouble with CSS Grid in Safari. The layout works perfectly in Chrome and Firefox, but in Safari, the grid items are overlapping.

Here's my CSS:

\`\`\`css
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}
\`\`\`

The issue seems to be with the \`auto-fit\` value. Has anyone encountered this before?

**Browser:** Safari 14.1
**OS:** macOS Big Sur
**Expected:** Grid items should be properly spaced
**Actual:** Grid items overlap each other`,
        severity: 'MEDIUM',
        tags: ['CSS', 'Safari', 'Grid', 'Browser-Bug'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        authorId: users[1].id,
      },
    }),
  ]);

  console.log('✅ Created sample bugs');

  // Create some follows
  await prisma.follow.createMany({
    data: [
      { followerId: users[0].id, followingId: users[1].id },
      { followerId: users[0].id, followingId: users[2].id },
      { followerId: users[1].id, followingId: users[0].id },
      { followerId: users[2].id, followingId: users[0].id },
    ],
  });

  console.log('✅ Created sample follows');

  // Create some likes
  await prisma.like.createMany({
    data: [
      { userId: users[1].id, snippetId: snippets[0].id },
      { userId: users[2].id, snippetId: snippets[0].id },
      { userId: users[0].id, snippetId: snippets[1].id },
      { userId: users[2].id, snippetId: snippets[1].id },
      { userId: users[0].id, docId: docs[0].id },
      { userId: users[1].id, bugId: bugs[0].id },
    ],
  });

  console.log('✅ Created sample likes');

  // Create some comments
  await prisma.comment.createMany({
    data: [
      {
        content: 'Great hook! I\'ve been looking for something like this.',
        authorId: users[1].id,
        snippetId: snippets[0].id,
      },
      {
        content: 'This is exactly what I needed for my project. Thanks for sharing!',
        authorId: users[2].id,
        snippetId: snippets[0].id,
      },
      {
        content: 'Try using `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))` instead of auto-fit. That usually fixes Safari issues.',
        authorId: users[0].id,
        bugId: bugs[0].id,
      },
    ],
  });

  console.log('✅ Created sample comments');

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });