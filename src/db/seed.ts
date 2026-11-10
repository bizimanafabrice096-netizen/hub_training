import bcrypt from 'bcryptjs';
import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  courses,
  lessons,
  modules,
  users,
  type QuizData,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const [{ value: courseCount }] = await db
        .select({ value: count() })
        .from(courses);

      if (Number(courseCount) > 0) {
        return;
      }

      const defaultPasswordHash = await bcrypt.hash('MeridianPass2026!', 10);

      // Seed faculty instructors
      const [drVance] = await db
        .insert(users)
        .values({
          uid: 'faculty-elena-vance',
          email: 'elena.vance@meridian.edu',
          name: 'Prof. Elena Vance',
          passwordHash: defaultPasswordHash,
          role: 'INSTRUCTOR',
          bio: 'Principal Systems Architect & Professor of Distributed Computing.',
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: 'Prof. Elena Vance', role: 'INSTRUCTOR' },
        })
        .returning();

      const [drOkafor] = await db
        .insert(users)
        .values({
          uid: 'faculty-marcus-okafor',
          email: 'marcus.okafor@meridian.edu',
          name: 'Dr. Marcus Okafor',
          passwordHash: defaultPasswordHash,
          role: 'INSTRUCTOR',
          bio: 'Research Director in Statistical Learning & Optimization Theory.',
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: 'Dr. Marcus Okafor', role: 'INSTRUCTOR' },
        })
        .returning();

      const [drLindqvist] = await db
        .insert(users)
        .values({
          uid: 'faculty-soren-lindqvist',
          email: 'soren.lindqvist@meridian.edu',
          name: 'Dr. Soren Lindqvist',
          passwordHash: defaultPasswordHash,
          role: 'INSTRUCTOR',
          bio: 'Chair of Quantum Hardware Engineering & Cryogenic Systems.',
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: 'Dr. Soren Lindqvist', role: 'INSTRUCTOR' },
        })
        .returning();

      // Seed 4 comprehensive courses
      const seededCourses = [
        {
          slug: 'distributed-systems-consensus',
          title: 'Distributed Systems & Consensus Architecture',
          subtitle: 'Fault-tolerant replication, Raft, Paxos, and linearizable state machines.',
          description:
            'Master the engineering foundations behind globally replicated databases and high-availability clusters. Through architectural breakdowns, formal safety invariants, and interactive assessments, learn how Raft, leader leases, and vector clocks guarantee consistency under network partitions.',
          category: 'Systems Engineering',
          level: 'Advanced',
          thumbnailUrl: '/src/assets/images/course_distributed_systems_1794298061914.jpg',
          durationHours: 14,
          instructorId: drVance.id,
          modules: [
            {
              title: 'Module 1: Time, Clocks & State Replication',
              summary: 'Logical clocks, partial synchrony, and replicated state machine invariants.',
              lessons: [
                {
                  title: 'Lamport Timestamps & Causal Ordering',
                  lessonType: 'VIDEO' as const,
                  durationMinutes: 16,
                  videoKey: 'sample-distributed-lamport.mp4',
                  contentMarkdown: `## Causal Ordering Without Synchronized Clocks

Physical wall-clock time drifts across nodes due to quartz oscillator skew and NTP jitter. Leslie Lamport's **happens-before relation** ($a \\rightarrow b$) defines causality strictly through message exchanges rather than physical timestamps.

### Core Invariants
1. **Local Execution**: If event $a$ precedes $b$ in the same process, $C(a) < C(b)$.
2. **Message Passing**: If $a$ is sending message $m$ and $b$ is receiving $m$, then $C(a) < C(b)$.
3. **Clock Rule**: Upon receiving a message carrying timestamp $t$, a node advances its local counter to $\\max(C_{\\text{local}}, t) + 1$.

\`\`\`ts
class LamportClock {
  private counter = 0;
  tick(): number {
    this.counter += 1;
    return this.counter;
  }
  receive(remoteTimestamp: number): number {
    this.counter = Math.max(this.counter, remoteTimestamp) + 1;
    return this.counter;
  }
}
\`\`\`

**Key Limitation**: Lamport timestamps guarantee $a \\rightarrow b \\implies C(a) < C(b)$, but the converse does not hold—concurrent events cannot be distinguished without **Vector Clocks**.`,
                  attachments: [
                    {
                      name: 'Lamport_1978_Annotated_Notes.pdf',
                      key: 'sample-lamport-notes.pdf',
                      sizeLabel: '1.4 MB',
                      mimeType: 'application/pdf',
                    },
                  ],
                  quizData: null,
                },
                {
                  title: 'Raft Consensus: Leader Election & Log Safety',
                  lessonType: 'ARTICLE' as const,
                  durationMinutes: 18,
                  videoKey: null,
                  contentMarkdown: `## Decomposing Consensus with Raft

Raft separates consensus into three orthogonal sub-problems: **Leader Election**, **Log Replication**, and **Safety**.

### Election Terms & Quorum Intersection
- Every cluster epoch is indexed by a monotonically increasing **term** integer.
- A candidate wins an election only after securing votes from a majority quorum $\\lfloor N/2 \\rfloor + 1$.
- Because any two majorities share at least one overlapping node, at most **one leader** can be elected per term.

### The Log Matching Property
If two log entries across different servers share the same \`index\` and \`term\`, they store identical state-machine commands and all preceding entries are identical. Leaders enforce this inductively during \`AppendEntries\` RPCs via \`prevLogIndex\` and \`prevLogTerm\`.`,
                  attachments: [
                    {
                      name: 'Raft_State_Transition_Spec.md',
                      key: 'sample-raft-spec.md',
                      sizeLabel: '42 KB',
                      mimeType: 'text/markdown',
                    },
                  ],
                  quizData: null,
                },
                {
                  title: 'Module 1 Checkpoint: Consensus & Ordering Quiz',
                  lessonType: 'QUIZ' as const,
                  durationMinutes: 10,
                  videoKey: null,
                  contentMarkdown: `## Assessment Guidelines

Complete this checkpoint with a score of **70% or higher** to advance and verify your understanding of logical clocks and Raft quorum safety.`,
                  attachments: [],
                  quizData: {
                    passingScore: 70,
                    questions: [
                      {
                        id: 'ds-q1',
                        prompt:
                          'In a 5-node Raft cluster, what is the minimum quorum size required to elect a leader and commit log entries?',
                        options: ['2 nodes', '3 nodes', '4 nodes', '5 nodes'],
                        correctIndex: 1,
                        explanation:
                          'A Raft quorum is floor(N/2) + 1. For N = 5, floor(5/2) + 1 = 3 nodes, ensuring any two quorums intersect.',
                      },
                      {
                        id: 'ds-q2',
                        prompt:
                          'If Lamport clock C(a) < C(b), what can we definitively conclude about events a and b?',
                        options: [
                          'Event a definitely caused event b',
                          'Event b did not happen before event a',
                          'Events a and b occurred on the same physical host',
                          'The physical clock of node a is slower than node b',
                        ],
                        correctIndex: 1,
                        explanation:
                          'By contrapositive of the Clock Condition (b -> a implies C(b) < C(a)), C(a) < C(b) guarantees b did NOT happen before a, though they may be concurrent.',
                      },
                      {
                        id: 'ds-q3',
                        prompt:
                          'Which RPC fields does a Raft leader send to verify log prefix consistency on followers?',
                        options: [
                          'lastApplied and commitIndex',
                          'prevLogIndex and prevLogTerm',
                          'termId and voterSignature',
                          'snapshotOffset and crc32',
                        ],
                        correctIndex: 1,
                        explanation:
                          'AppendEntries includes prevLogIndex and prevLogTerm so the follower can verify its log matches the leader immediately before the new entries.',
                      },
                    ],
                  } satisfies QuizData,
                },
              ],
            },
          ],
        },
        {
          slug: 'machine-learning-optimization',
          title: 'Mathematical Foundations of Machine Learning',
          subtitle: 'Convex optimization, gradient geometry, regularization, and generalization bounds.',
          description:
            'Build deep mathematical fluency in modern machine learning. Examine loss landscapes, stochastic gradient descent dynamics, Adam momentum preconditioning, and bias-variance decompositions with interactive derivations.',
          category: 'Machine Learning',
          level: 'Intermediate',
          thumbnailUrl: '/src/assets/images/course_machine_learning_1794298061871.jpg',
          durationHours: 12,
          instructorId: drOkafor.id,
          modules: [
            {
              title: 'Module 1: Gradient Geometry & Optimization',
              summary: 'Convexity, Hessian conditioning, and adaptive momentum methods.',
              lessons: [
                {
                  title: 'Hessian Conditioning & Learning Rate Stability',
                  lessonType: 'VIDEO' as const,
                  durationMinutes: 15,
                  videoKey: 'sample-ml-hessian.mp4',
                  contentMarkdown: `## Why Loss Landscapes Become Ill-Conditioned

For a twice-differentiable objective $L(\\theta)$, the local curvature is captured by the **Hessian matrix** $H = \\nabla^2 L(\\theta)$. The condition number $\\kappa = \\lambda_{\\max} / \\lambda_{\\min}$ dictates how sharply curvature varies across parameter directions.

### Practical Stability Bound
For standard gradient descent $\\theta_{t+1} = \\theta_t - \\eta \\nabla L(\\theta_t)$ on an $L$-smooth function, convergence requires:
$$\\eta < \\frac{2}{\\lambda_{\\max}}$$
When $\\kappa \\gg 1$, small step sizes crawl along flat valleys while larger step sizes oscillate violently across steep ravines.`,
                  attachments: [],
                  quizData: null,
                },
                {
                  title: 'Assessment: Optimization & Generalization',
                  lessonType: 'QUIZ' as const,
                  durationMinutes: 10,
                  videoKey: null,
                  contentMarkdown: `## Graded Mastery Check

Demonstrate mastery of Hessian conditioning, momentum updates, and L2 weight decay.`,
                  attachments: [],
                  quizData: {
                    passingScore: 70,
                    questions: [
                      {
                        id: 'ml-q1',
                        prompt:
                          'What happens in gradient descent when the learning rate exceeds 2 / lambda_max along the steepest eigen-direction?',
                        options: [
                          'Convergence accelerates quadratically',
                          'Updates overshoot and diverge/oscillate along that eigenvector',
                          'The Hessian becomes strictly positive definite',
                          'Regularization automatically cancels the step',
                        ],
                        correctIndex: 1,
                        explanation:
                          'Along an eigenvector with curvature lambda_max, the error multiplier is |1 - eta * lambda_max|, which exceeds 1 when eta > 2 / lambda_max.',
                      },
                      {
                        id: 'ml-q2',
                        prompt:
                          'How does decoupled weight decay (AdamW) differ from standard L2 regularization inside Adam?',
                        options: [
                          'AdamW applies weight decay directly to weights rather than scaling it by the adaptive variance estimate',
                          'AdamW removes the first-moment moving average',
                          'AdamW only updates bias parameters',
                          'AdamW requires second-order Hessian inversion',
                        ],
                        correctIndex: 0,
                        explanation:
                          'Adding L2 penalty to the loss causes Adam to divide the decay term by sqrt(v_t); AdamW decouples weight decay so large-gradient weights still decay proportionally.',
                      },
                    ],
                  } satisfies QuizData,
                },
              ],
            },
          ],
        },
        {
          slug: 'systems-product-architecture',
          title: 'Systems Product & Technical Architecture',
          subtitle: 'From domain modeling and API contracts to resilient multi-region delivery.',
          description:
            'A rigorous studio course on designing production software architectures. Learn bounded contexts, idempotent API design, caching strategies, and observability trade-offs.',
          category: 'Software Architecture',
          level: 'Intermediate',
          thumbnailUrl: '/src/assets/images/course_product_architecture_1794298063212.jpg',
          durationHours: 10,
          instructorId: drVance.id,
          modules: [
            {
              title: 'Module 1: Domain Contracts & Resilience',
              summary: 'Idempotency keys, backpressure, and schema evolution.',
              lessons: [
                {
                  title: 'Idempotent Endpoints & Outbox Patterns',
                  lessonType: 'ARTICLE' as const,
                  durationMinutes: 14,
                  videoKey: null,
                  contentMarkdown: `## Designing Safe Mutating APIs

In distributed networks, clients inevitably retry timed-out \`POST\` requests. Without **idempotency keys**, retries duplicate orders, charges, or enrollment records.

### Transactional Outbox Checklist
- Store the client-supplied \`Idempotency-Key\` alongside the domain mutation inside the **same ACID database transaction**.
- Publish asynchronous side-effects (emails, webhooks, analytics) from an outbox table rather than firing network calls mid-transaction.`,
                  attachments: [],
                  quizData: null,
                },
                {
                  title: 'Architecture Review Quiz',
                  lessonType: 'QUIZ' as const,
                  durationMinutes: 8,
                  videoKey: null,
                  contentMarkdown: `## Final Architecture Evaluation`,
                  attachments: [],
                  quizData: {
                    passingScore: 70,
                    questions: [
                      {
                        id: 'arch-q1',
                        prompt:
                          'Why should an idempotency record be persisted inside the same database transaction as the business write?',
                        options: [
                          'To bypass TLS encryption overhead',
                          'To guarantee atomicity so partial failures never leave a mutation recorded without its idempotency guard',
                          'To allow GET requests to mutate state',
                          'To eliminate database indexes',
                        ],
                        correctIndex: 1,
                        explanation:
                          'Atomic persistence prevents split-brain states where the business action commits but the idempotency record fails to save.',
                      },
                    ],
                  } satisfies QuizData,
                },
              ],
            },
          ],
        },
        {
          slug: 'quantum-hardware-engineering',
          title: 'Quantum Hardware & Cryogenic Engineering',
          subtitle: 'Superconducting transmon qubits, dilution refrigeration, and microwave control.',
          description:
            'Explore the physical layer of fault-tolerant quantum computers. Understand Josephson junctions, thermal noise floors at 15 millikelvin, and pulse-level gate calibration.',
          category: 'Quantum Computing',
          level: 'Advanced',
          thumbnailUrl: '/src/assets/images/course_quantum_computing_1794298069449.jpg',
          durationHours: 16,
          instructorId: drLindqvist.id,
          modules: [
            {
              title: 'Module 1: Transmon Physics & Dilution Stages',
              summary: 'Anharmonic oscillators and millikelvin thermal isolation.',
              lessons: [
                {
                  title: 'Thermal Noise & 15 mK Mixing Chambers',
                  lessonType: 'VIDEO' as const,
                  durationMinutes: 20,
                  videoKey: 'sample-quantum-cryo.mp4',
                  contentMarkdown: `## Why Superconducting Qubits Operate at 15 Millikelvin

A typical superconducting transmon qubit has a transition frequency around $\\omega_{01}/2\\pi \\approx 5\\text{ GHz}$, corresponding to an energy gap $hf \\approx k_B \\cdot 240\\text{ mK}$.

### Suppressing Thermal Excitation
To keep the Boltzmann thermal population $\\exp(-hf / k_B T)$ negligible ($< 10^{-7}$), the mixing chamber plate of a $^3\\text{He}/^4\\text{He}$ dilution refrigerator must remain near **10–15 mK**, reinforced by multi-stage coaxial attenuation along every microwave drive line.`,
                  attachments: [],
                  quizData: null,
                },
                {
                  title: 'Cryogenic Systems Verification Quiz',
                  lessonType: 'QUIZ' as const,
                  durationMinutes: 10,
                  videoKey: null,
                  contentMarkdown: `## Cryogenic Engineering Checkpoint`,
                  attachments: [],
                  quizData: {
                    passingScore: 70,
                    questions: [
                      {
                        id: 'qc-q1',
                        prompt:
                          'Why are attenuators installed at multiple temperature stages (4 K, 800 mK, 15 mK) inside a dilution refrigerator?',
                        options: [
                          'To amplify thermal room-temperature noise',
                          'To thermalize room-temperature microwave noise down to the local stage temperature while preserving control pulse SNR',
                          'To convert DC currents into optical photons',
                          'To increase qubit decoherence rates',
                        ],
                        correctIndex: 1,
                        explanation:
                          'Distributed cryogenic attenuation suppresses 300 K blackbody noise photons at higher-cooling-power stages before reaching the 15 mK mixing chamber.',
                      },
                    ],
                  } satisfies QuizData,
                },
              ],
            },
          ],
        },
      ];

      for (const courseInput of seededCourses) {
        const [createdCourse] = await db
          .insert(courses)
          .values({
            slug: courseInput.slug,
            title: courseInput.title,
            subtitle: courseInput.subtitle,
            description: courseInput.description,
            category: courseInput.category,
            level: courseInput.level,
            thumbnailUrl: courseInput.thumbnailUrl,
            durationHours: courseInput.durationHours,
            published: true,
            instructorId: courseInput.instructorId,
          })
          .returning();

        for (let mIdx = 0; mIdx < courseInput.modules.length; mIdx += 1) {
          const modInput = courseInput.modules[mIdx];
          const [createdModule] = await db
            .insert(modules)
            .values({
              courseId: createdCourse.id,
              title: modInput.title,
              summary: modInput.summary,
              orderIndex: mIdx + 1,
            })
            .returning();

          for (let lIdx = 0; lIdx < modInput.lessons.length; lIdx += 1) {
            const lessonInput = modInput.lessons[lIdx];
            await db.insert(lessons).values({
              moduleId: createdModule.id,
              title: lessonInput.title,
              lessonType: lessonInput.lessonType,
              videoKey: lessonInput.videoKey,
              durationMinutes: lessonInput.durationMinutes,
              contentMarkdown: lessonInput.contentMarkdown,
              attachments: lessonInput.attachments,
              quizData: lessonInput.quizData,
              orderIndex: lIdx + 1,
            });
          }
        }
      }
    } catch (err) {
      seedPromise = null;
      throw err;
    }
  })();

  return seedPromise;
}
