import { randomBytes } from "node:crypto";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Building2, Pencil, Warehouse as WarehouseIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";
import { getStaffMember } from "@/lib/staff-session";
import { canCreateWarehouse } from "@/lib/staff-roles";
import { AMENITY_LABELS, PPE_LABELS, parseChecklist, serializeChecklist } from "@/lib/warehouse-amenities";
import { SortableHeader } from "@/components/sortable-header";
import { Prisma } from "@/app/generated/prisma/client";

function formatLocation(street: string, city: string, state: string, zip: string): string {
  const cityStateZip = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function readWarehouseFields(formData: FormData) {
  const emailSubscribers = String(formData.get("emailSubscribers") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .join(",");

  return {
    name: String(formData.get("name") ?? "").trim(),
    street: String(formData.get("street") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    zip: String(formData.get("zip") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    storeNumber: String(formData.get("storeNumber") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    publicPortalEnabled: formData.get("publicPortalEnabled") === "on",
    carrierInstructions: String(formData.get("carrierInstructions") ?? "").trim(),
    amenities: serializeChecklist(formData.getAll("amenities").map(String), AMENITY_LABELS),
    ppeRequirements: serializeChecklist(formData.getAll("ppeRequirements").map(String), PPE_LABELS),
    emailSubscribers,
  };
}

async function createWarehouse(formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  const fields = readWarehouseFields(formData);
  const accountId = staff.role === "SUPER_USER" ? String(formData.get("accountId") ?? "").trim() : staff.accountId!;
  const managerName = staff.role === "SUPER_USER" ? String(formData.get("managerName") ?? "").trim() : "";
  const managerEmail = staff.role === "SUPER_USER" ? String(formData.get("managerEmail") ?? "").trim() : "";
  const managerPassword = staff.role === "SUPER_USER" ? String(formData.get("managerPassword") ?? "") : "";

  if (!fields.name || !fields.street || !fields.city || !accountId) return;

  const warehouse = await prisma.warehouse.create({
    data: {
      name: fields.name,
      location: formatLocation(fields.street, fields.city, fields.state, fields.zip),
      street: fields.street,
      city: fields.city,
      state: fields.state || null,
      zip: fields.zip || null,
      country: fields.country || null,
      storeNumber: fields.storeNumber || null,
      phone: fields.phone || null,
      contactEmail: fields.contactEmail || null,
      notes: fields.notes || null,
      publicPortalEnabled: fields.publicPortalEnabled,
      carrierInstructions: fields.carrierInstructions || null,
      amenities: fields.amenities,
      ppeRequirements: fields.ppeRequirements,
      emailSubscribers: fields.emailSubscribers,
      accountId,
      publicBookingSlug: randomBytes(16).toString("hex"),
    },
  });

  if (staff.role === "WAREHOUSE_MANAGER") {
    await prisma.staffWarehouse.create({ data: { staffId: staff.id, warehouseId: warehouse.id } });
  }

  if (managerName && managerEmail && managerPassword) {
    try {
      await prisma.staff.create({
        data: {
          name: managerName,
          email: managerEmail,
          passwordHash: hashPassword(managerPassword),
          role: "WAREHOUSE_MANAGER",
          accountId,
          warehouseId: warehouse.id,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(
          "/staff/warehouses?error=" +
            encodeURIComponent("Warehouse created, but a staff account with that manager email already exists."),
        );
      }
      throw error;
    }
  }

  revalidatePath("/staff/warehouses");
  redirect("/staff/warehouses?message=" + encodeURIComponent("Warehouse created."));
}

async function toggleWarehouseActive(warehouseId: string, currentlyActive: boolean) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  const existing = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { accountId: true } });
  if (!existing) return;
  if (staff.role !== "SUPER_USER" && existing.accountId !== staff.accountId) return;

  await prisma.warehouse.update({ where: { id: warehouseId }, data: { active: !currentlyActive } });

  revalidatePath("/staff/warehouses");
}

async function updateWarehouse(warehouseId: string, formData: FormData) {
  "use server";

  const staff = await getStaffMember();
  if (!staff || !canCreateWarehouse(staff.role)) return;

  const existing = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { accountId: true } });
  if (!existing) return;
  if (staff.role !== "SUPER_USER" && existing.accountId !== staff.accountId) return;

  const fields = readWarehouseFields(formData);
  if (!fields.name || !fields.street || !fields.city) return;

  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      name: fields.name,
      location: formatLocation(fields.street, fields.city, fields.state, fields.zip),
      street: fields.street,
      city: fields.city,
      state: fields.state || null,
      zip: fields.zip || null,
      country: fields.country || null,
      storeNumber: fields.storeNumber || null,
      phone: fields.phone || null,
      contactEmail: fields.contactEmail || null,
      notes: fields.notes || null,
      publicPortalEnabled: fields.publicPortalEnabled,
      carrierInstructions: fields.carrierInstructions || null,
      amenities: fields.amenities,
      ppeRequirements: fields.ppeRequirements,
      emailSubscribers: fields.emailSubscribers,
    },
  });

  revalidatePath("/staff/warehouses");
  redirect("/staff/warehouses?message=" + encodeURIComponent("Warehouse updated."));
}

const GRID_COLS = "grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_1fr_auto]";

function ChecklistFields({
  legend,
  name,
  labels,
  defaultSelected,
  idPrefix,
}: {
  legend: string;
  name: string;
  labels: Record<string, string>;
  defaultSelected: string[];
  idPrefix: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{legend}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {Object.entries(labels).map(([slug, label]) => (
          <label key={slug} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              id={`${idPrefix}-${name}-${slug}`}
              name={name}
              value={slug}
              defaultChecked={defaultSelected.includes(slug)}
              className="h-3.5 w-3.5 rounded border-black/[.2] dark:border-white/[.3]"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function WarehouseFormFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: {
    storeNumber: string;
    phone: string;
    contactEmail: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    notes: string;
    emailSubscribers: string;
    publicPortalEnabled: boolean;
    carrierInstructions: string;
    amenities: string[];
    ppeRequirements: string[];
  };
}) {
  const inputClass =
    "h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
  const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <>
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-storeNumber`} className={labelClass}>
            Store Number
          </label>
          <input
            id={`${idPrefix}-storeNumber`}
            name="storeNumber"
            type="text"
            defaultValue={defaults?.storeNumber}
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-phone`} className={labelClass}>
            Phone
          </label>
          <input id={`${idPrefix}-phone`} name="phone" type="tel" defaultValue={defaults?.phone} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-contactEmail`} className={labelClass}>
          Warehouse Contact Email
        </label>
        <input
          id={`${idPrefix}-contactEmail`}
          name="contactEmail"
          type="email"
          defaultValue={defaults?.contactEmail}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-street`} className={labelClass}>
          Street Address
        </label>
        <input
          id={`${idPrefix}-street`}
          name="street"
          type="text"
          required
          defaultValue={defaults?.street}
          className={inputClass}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-[2] flex-col gap-1">
          <label htmlFor={`${idPrefix}-city`} className={labelClass}>
            City
          </label>
          <input id={`${idPrefix}-city`} name="city" type="text" required defaultValue={defaults?.city} className={inputClass} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-state`} className={labelClass}>
            State
          </label>
          <input id={`${idPrefix}-state`} name="state" type="text" defaultValue={defaults?.state} className={inputClass} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-zip`} className={labelClass}>
            Zip
          </label>
          <input id={`${idPrefix}-zip`} name="zip" type="text" defaultValue={defaults?.zip} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-country`} className={labelClass}>
          Country
        </label>
        <input
          id={`${idPrefix}-country`}
          name="country"
          type="text"
          defaultValue={defaults?.country}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={defaults?.notes}
          className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-emailSubscribers`} className={labelClass}>
          Default Email Subscribers
        </label>
        <input
          id={`${idPrefix}-emailSubscribers`}
          name="emailSubscribers"
          type="text"
          placeholder="ops@example.com, receiving@example.com"
          defaultValue={defaults?.emailSubscribers}
          className={inputClass}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          Comma-separated. CC&apos;d on booking confirmation emails for this warehouse.
        </span>
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Scheduling Portal Availability</span>
        <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="publicPortalEnabled"
            defaultChecked={defaults?.publicPortalEnabled ?? false}
            className="mt-0.5 h-3.5 w-3.5 rounded border-black/[.2] dark:border-white/[.3]"
          />
          <span>
            Warehouse available on the Scheduling Portal
            <br />
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              Makes this warehouse&apos;s public booking link accept requests from carriers.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-carrierInstructions`} className={labelClass}>
            Instructions for Carriers
          </label>
          <textarea
            id={`${idPrefix}-carrierInstructions`}
            name="carrierInstructions"
            rows={2}
            defaultValue={defaults?.carrierInstructions}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Displayed on the public booking page and in booking emails.
          </span>
        </div>

        <ChecklistFields
          legend="Amenities available at the warehouse"
          name="amenities"
          labels={AMENITY_LABELS}
          defaultSelected={defaults?.amenities ?? []}
          idPrefix={idPrefix}
        />
        <ChecklistFields
          legend="PPE and other requirements"
          name="ppeRequirements"
          labels={PPE_LABELS}
          defaultSelected={defaults?.ppeRequirements ?? []}
          idPrefix={idPrefix}
        />
      </div>
    </>
  );
}

export default async function StaffWarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    q?: string;
    accountId?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const staff = await getStaffMember();
  if (!staff) return null;
  if (!canCreateWarehouse(staff.role)) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have access to this page.</p>;
  }

  const isSuperUser = staff.role === "SUPER_USER";
  const params = await searchParams;
  const { error, message, q, accountId, status } = params;

  const accounts = isSuperUser
    ? await prisma.account.findMany({ orderBy: { name: "asc" } })
    : await prisma.account.findMany({ where: { id: staff.accountId! }, orderBy: { name: "asc" } });

  const scopedAccountId = isSuperUser ? accountId : staff.accountId!;

  const warehouses = await prisma.warehouse.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q } }, { location: { contains: q } }] } : {}),
      ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
      ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { docks: true, staff: true } }, account: { select: { name: true } } },
  });

  const sorted = [...warehouses].sort((a, b) => {
    const dir = params.dir === "desc" ? -1 : 1;
    switch (params.sort) {
      case "account":
        return a.account.name.localeCompare(b.account.name) * dir;
      case "location":
        return a.location.localeCompare(b.location) * dir;
      case "docks":
        return (a._count.docks - b._count.docks) * dir;
      case "staff":
        return (a._count.staff - b._count.staff) * dir;
      case "status":
        return (Number(a.active) - Number(b.active)) * dir;
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Warehouses</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isSuperUser ? "Manage warehouses across every account" : "Manage your account's warehouses"}
          </p>
        </div>
        {accounts.length > 0 && (
          <button
            popoverTarget="add-warehouse-popover"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + Add Warehouse
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Create an Account first on the{" "}
          <a href="/staff/accounts" className="underline">
            Accounts
          </a>{" "}
          page.
        </p>
      ) : (
        <div
          id="add-warehouse-popover"
          popover="auto"
          className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
        >
          <div className="flex items-start gap-3 border-b border-black/[.06] p-5 dark:border-white/[.08]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <WarehouseIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-black dark:text-zinc-50">Add Warehouse</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isSuperUser ? "Optionally assign its first Warehouse Manager" : "You'll be given access automatically"}
              </p>
            </div>
          </div>
          <form action={createWarehouse} className="flex flex-col gap-4 p-5">
            {isSuperUser && (
              <div className="flex flex-col gap-1">
                <label htmlFor="accountId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Account
                </label>
                <select
                  id="accountId"
                  name="accountId"
                  required
                  className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </div>

            <WarehouseFormFields idPrefix="add" />

            {isSuperUser && (
              <div className="flex flex-col gap-3 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  Optional — assign an initial Warehouse Manager
                </span>
                <div className="flex gap-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="managerName" className="text-xs text-zinc-600 dark:text-zinc-400">
                      Manager Name
                    </label>
                    <input
                      id="managerName"
                      name="managerName"
                      type="text"
                      className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="managerEmail" className="text-xs text-zinc-600 dark:text-zinc-400">
                      Manager Email
                    </label>
                    <input
                      id="managerEmail"
                      name="managerEmail"
                      type="email"
                      className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="managerPassword" className="text-xs text-zinc-600 dark:text-zinc-400">
                    Manager Password
                  </label>
                  <input
                    id="managerPassword"
                    name="managerPassword"
                    type="password"
                    className="h-9 w-full rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <button
                type="button"
                popoverTarget="add-warehouse-popover"
                popoverTargetAction="hide"
                className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Add Warehouse
              </button>
            </div>
          </form>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or location..."
          className="h-10 w-full max-w-sm rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        {isSuperUser && (
          <select
            name="accountId"
            defaultValue={accountId ?? ""}
            className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Apply
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div
          className={`grid ${GRID_COLS} gap-4 border-b border-black/[.06] px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/[.08] dark:text-zinc-400`}
        >
          <SortableHeader label="Name" sortKey="name" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Account" sortKey="account" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Location" sortKey="location" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Docks" sortKey="docks" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Staff" sortKey="staff" basePath="/staff/warehouses" searchParams={params} />
          <SortableHeader label="Status" sortKey="status" basePath="/staff/warehouses" searchParams={params} />
          <span />
        </div>

        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500 dark:text-zinc-500">No warehouses found.</p>
        ) : (
          sorted.map((w) => {
            const boundToggle = toggleWarehouseActive.bind(null, w.id, w.active);
            const boundUpdate = updateWarehouse.bind(null, w.id);
            return (
              <Fragment key={w.id}>
              <div
                className={`grid ${GRID_COLS} items-center gap-4 border-b border-black/[.06] px-4 py-3 text-sm last:border-b-0 dark:border-white/[.08]`}
              >
                <span className="font-medium text-black dark:text-zinc-50">{w.name}</span>
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {w.account.name}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{w.location}</span>
                <span className="text-zinc-600 dark:text-zinc-400">{w._count.docks}</span>
                <span className="text-zinc-600 dark:text-zinc-400">{w._count.staff}</span>
                <span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.active
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {w.active ? "Active" : "Inactive"}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    popoverTarget={`edit-warehouse-${w.id}`}
                    title="Edit warehouse"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[.08] transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {w.active ? (
                    <button
                      type="button"
                      popoverTarget={`deactivate-confirm-${w.id}`}
                      className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium whitespace-nowrap transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <form action={boundToggle}>
                      <button
                        type="submit"
                        className="h-7 rounded-full border border-black/[.08] px-3 text-xs font-medium whitespace-nowrap transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                      >
                        Reactivate
                      </button>
                    </form>
                  )}
                </span>
              </div>

              <div
                id={`deactivate-confirm-${w.id}`}
                popover="auto"
                className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-5 shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <h2 className="text-base font-semibold text-black dark:text-zinc-50">Deactivate {w.name}?</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Deactivating will prevent carriers and staff from scheduling new dock appointments at this
                  warehouse. Existing bookings and data stay visible, and you can reactivate at any time.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    popoverTarget={`deactivate-confirm-${w.id}`}
                    popoverTargetAction="hide"
                    className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    Cancel
                  </button>
                  <form action={boundToggle}>
                    <button
                      type="submit"
                      className="h-9 rounded-full bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Deactivate
                    </button>
                  </form>
                </div>
              </div>

              <div
                id={`edit-warehouse-${w.id}`}
                popover="auto"
                className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-[#0a0a0a]"
              >
                <div className="flex items-start gap-3 border-b border-black/[.06] p-5 dark:border-white/[.08]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <Pencil className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-black dark:text-zinc-50">Edit Warehouse</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{w.account.name}</p>
                  </div>
                </div>
                <form action={boundUpdate} className="flex flex-col gap-4 p-5">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`edit-name-${w.id}`} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Name
                    </label>
                    <input
                      id={`edit-name-${w.id}`}
                      name="name"
                      type="text"
                      required
                      defaultValue={w.name}
                      className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  </div>

                  <WarehouseFormFields
                    idPrefix={`edit-${w.id}`}
                    defaults={{
                      storeNumber: w.storeNumber ?? "",
                      phone: w.phone ?? "",
                      contactEmail: w.contactEmail ?? "",
                      street: w.street ?? "",
                      city: w.city ?? "",
                      state: w.state ?? "",
                      zip: w.zip ?? "",
                      country: w.country ?? "",
                      notes: w.notes ?? "",
                      emailSubscribers: w.emailSubscribers,
                      publicPortalEnabled: w.publicPortalEnabled,
                      carrierInstructions: w.carrierInstructions ?? "",
                      amenities: parseChecklist(w.amenities, AMENITY_LABELS),
                      ppeRequirements: parseChecklist(w.ppeRequirements, PPE_LABELS),
                    }}
                  />

                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    To move this warehouse to a different account, deactivate it here and create a new one under the
                    target account instead — reassigning would desync any staff already assigned to it.
                  </p>
                  <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                    <button
                      type="button"
                      popoverTarget={`edit-warehouse-${w.id}`}
                      popoverTargetAction="hide"
                      className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
