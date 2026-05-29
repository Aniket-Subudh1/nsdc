
export default function Page() {
  return (
      <div className="flex h-full w-full flex-1 flex-col gap-2 rounded-tl-2xl border border-neutral-200 bg-white p-2 md:p-10">
        <div className="flex gap-2">
          {[...new Array(4)].map((_, idx) => (
            <div
              key={"admin-card-" + idx}
              className="h-20 w-full animate-pulse rounded-lg bg-gray-100"
            ></div>
          ))}
        </div>
        <div className="flex flex-1 gap-2">
          {[...new Array(2)].map((_, idx) => (
            <div
              key={"admin-panel-" + idx}
              className="h-full w-full animate-pulse rounded-lg bg-gray-100"
            ></div>
          ))}
        </div>
      </div>
  );
}
