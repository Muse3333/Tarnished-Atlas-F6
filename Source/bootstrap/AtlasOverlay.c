#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>

static DWORD WINAPI start_atlas(void *argument) {
    HMODULE module = (HMODULE)argument;
    wchar_t file[32768];
    const DWORD length = GetModuleFileNameW(module, file, ARRAYSIZE(file));
    if (length == 0 || length >= ARRAYSIZE(file)) return 1;

    wchar_t *tail = wcsrchr(file, L'\\');
    const wchar_t companion[] = L"AtlasOverlay.exe";
    if (!tail || ARRAYSIZE(file) - (tail + 1 - file) < ARRAYSIZE(companion)) return 2;
    CopyMemory(tail + 1, companion, sizeof companion);

    wchar_t command[100];
    if (swprintf(command, ARRAYSIZE(command), L"\"AtlasOverlay.exe\" --game %lu", (unsigned long)GetCurrentProcessId()) < 0) return 3;

    STARTUPINFOW startup = {0};
    startup.cb = sizeof startup;
    PROCESS_INFORMATION process = {0};
    if (!CreateProcessW(file, command, NULL, NULL, FALSE, 0, NULL, NULL, &startup, &process)) {
        OutputDebugStringW(L"Tarnished Atlas: could not launch AtlasOverlay.exe beside AtlasOverlay.dll.\n");
        return 4;
    }
    AllowSetForegroundWindow(process.dwProcessId);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}

BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID reserved) {
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(module);
        HANDLE worker = CreateThread(NULL, 0, start_atlas, module, 0, NULL);
        if (worker) CloseHandle(worker);
    }
    return TRUE;
}
