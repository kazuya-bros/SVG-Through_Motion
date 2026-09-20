"""Drive only this test server's native Save dialog to a new verification file."""
import ctypes
import sys
import time
from pathlib import Path
from ctypes import wintypes as w

pid = int(sys.argv[1]);destination = Path(sys.argv[2]).resolve()
assert destination.is_relative_to(Path('output/verification').resolve()) and not destination.exists()
u = ctypes.windll.user32;callback = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
u.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
u.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
u.GetDlgCtrlID.argtypes = [w.HWND]
u.EnumWindows.argtypes = [callback, w.LPARAM];u.EnumChildWindows.argtypes = [w.HWND, callback, w.LPARAM]
u.SendMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.SendMessageW.restype = ctypes.c_ssize_t
found = []
@callback
def window(h, _):
    owner = w.DWORD();u.GetWindowThreadProcessId(h, ctypes.byref(owner))
    text = ctypes.create_unicode_buffer(512);u.GetWindowTextW(h, text, 512)
    if owner.value == pid and text.value == 'プロジェクトの保存先':found.append(h)
    return True

for _ in range(300):
    u.EnumWindows(window, 0)
    if found:break
    time.sleep(.1)
assert found, 'native save dialog did not appear'
edits = []
@callback
def child(h, _):
    name = ctypes.create_unicode_buffer(256);u.GetClassNameW(h, name, 256)
    if name.value == 'Edit' and u.GetDlgCtrlID(h) == 1001:edits.append(h)
    return True

for _ in range(100):
    u.EnumChildWindows(found[0], child, 0)
    if edits:break
    time.sleep(.1)
assert len(edits) == 1, 'ambiguous filename control'
text = ctypes.create_unicode_buffer(str(destination.parent) + '\\')
u.SendMessageW(edits[0], 0x000C, 0, ctypes.cast(text, ctypes.c_void_p).value)
u.SendMessageW(found[0], 0x0111, 1, 0)
time.sleep(1)
u.IsWindow.argtypes = [w.HWND]
assert u.IsWindow(found[0]), 'directory navigation unexpectedly closed dialog'
edits.clear();u.EnumChildWindows(found[0], child, 0)
assert len(edits) == 1
text = ctypes.create_unicode_buffer(destination.name)
u.SendMessageW(edits[0], 0x000C, 0, ctypes.cast(text, ctypes.c_void_p).value)
u.SendMessageW(found[0], 0x0111, 1, 0)
print('Native Save dialog destination selected:', destination)
