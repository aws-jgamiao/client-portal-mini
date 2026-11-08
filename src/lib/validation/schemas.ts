import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalDate = z
  .union([z.iso.date({ message: "Enter a valid date." }), z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : null));

export const uuid = z.uuid({ message: "Invalid identifier." });

export const email = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." }));

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

export const organizationSchema = z.object({
  name: trimmed(2, 120, "Name"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60, "Slug must be 60 characters or fewer.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
});

export const inviteSchema = z.object({ orgId: uuid, email });

export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, "Invalid invitation link.");

export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
  fullName: trimmed(1, 120, "Full name"),
  password,
});

export const PROJECT_STATUSES = ["planning", "in_progress", "review", "completed", "on_hold"] as const;

export const projectSchema = z
  .object({
    name: trimmed(2, 120, "Project name"),
    description: z.string().trim().max(4000, "Description must be 4000 characters or fewer.").default(""),
    status: z.enum(PROJECT_STATUSES, { message: "Choose a status." }),
    startDate: optionalDate,
    dueDate: optionalDate,
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    message: "Due date can't be before the start date.",
    path: ["dueDate"],
  });

export const createProjectSchema = projectSchema.and(z.object({ orgId: uuid }));

export const milestoneSchema = z.object({
  projectId: uuid,
  title: trimmed(1, 160, "Milestone"),
  dueDate: optionalDate,
});

export const onboardingItemSchema = z.object({
  orgId: uuid,
  title: trimmed(1, 160, "Title"),
  description: z.string().trim().max(2000, "Description must be 2000 characters or fewer.").default(""),
  dueDate: optionalDate,
  required: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const messageSchema = z.object({
  orgId: uuid,
  body: trimmed(1, 4000, "Message"),
});

export const profileSchema = z.object({
  fullName: trimmed(1, 120, "Full name"),
  jobTitle: optionalText(120, "Job title"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() .-]{6,30}$/, "Use digits, spaces and + ( ) - only.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const documentMetaSchema = z.object({
  orgId: uuid,
  projectId: z
    .union([uuid, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  visibility: z.enum(["client", "internal"], { message: "Choose who can see this file." }),
});
