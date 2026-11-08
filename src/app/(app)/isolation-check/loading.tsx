// Leaf routes only: a loading boundary makes the response stream, which would
// turn a later notFound() into a 200. Never add one above a route that 404s.
export { PageSkeleton as default } from "@/components/page-skeleton";
