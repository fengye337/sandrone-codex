#import <Cocoa/Cocoa.h>
#import <signal.h>

@interface SandroneLauncher : NSObject <NSApplicationDelegate, NSMenuItemValidation>
@property NSWindow *window;
@property NSTextField *headline, *detail;
@property NSButton *startButton, *disableButton, *enableButton, *replayButton, *stopButton;
@property NSTask *task;
@property NSPipe *commands;
@property NSString *token, *state, *cleanup, *errorTail;
@property NSMutableData *pending;
@property BOOL quitting;
@property double startedMs;
#if SANDRONE_LAUNCHER_TEST
@property NSString *testMode;
@property NSMutableArray *testEvents;
@property NSInteger testStep;
@property BOOL testPassed;
@property NSInteger testLaunches, testTerminationDeferrals, testCancelledQuits;
#endif
@end

@implementation SandroneLauncher
- (NSString *)resources { return NSBundle.mainBundle.resourcePath; }
- (NSTextField *)label:(NSString *)text size:(CGFloat)size {
  NSTextField *label=[NSTextField wrappingLabelWithString:text];
  label.font=[NSFont systemFontOfSize:size];label.preferredMaxLayoutWidth=552; label.translatesAutoresizingMaskIntoConstraints=NO; return label;
}
- (NSButton *)button:(NSString *)title action:(SEL)action {
  NSButton *button=[NSButton buttonWithTitle:title target:self action:action];button.bezelStyle=NSBezelStyleRounded;return button;
}
- (void)showWindow:(id)sender { [self.window makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES]; }
- (void)buildInterface {
  NSMenu *bar=[NSMenu new], *menu=[NSMenu new];NSMenuItem *root=[NSMenuItem new];root.submenu=menu;[bar addItem:root];NSApp.mainMenu=bar;
  for(NSArray *item in @[@[@"顯示啟動器",NSStringFromSelector(@selector(showWindow:)),@""],@[@"使用與還原說明",NSStringFromSelector(@selector(openHelp:)),@""],@[@"開啟診斷資料夾",NSStringFromSelector(@selector(openLogs:)),@""],@[@"結束桑多涅啟動器",NSStringFromSelector(@selector(quit:)),@"q"]]){
    NSMenuItem *entry=[[NSMenuItem alloc] initWithTitle:item[0] action:NSSelectorFromString(item[1]) keyEquivalent:item[2]];entry.target=self;[menu addItem:entry];
  }
  self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,600,350) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable backing:NSBackingStoreBuffered defer:NO];
  self.window.title=@"桑多涅啟動器";self.window.releasedWhenClosed=NO;[self.window center];
  self.headline=[self label:@"準備啟動" size:20];self.headline.font=[NSFont boldSystemFontOfSize:20];
  self.detail=[self label:@"" size:13];self.detail.selectable=YES;self.detail.maximumNumberOfLines=5;
  NSTextField *note=[self label:@"主題與開屏會稍晚載入。請從本啟動器啟動；官方圖示不會自動套用主題。\n關閉此視窗仍會繼續運行。停止載入器不會退出 ChatGPT；除錯端點須在你完全退出 ChatGPT 後才關閉。" size:12];note.textColor=NSColor.secondaryLabelColor;
  self.startButton=[self button:@"啟動" action:@selector(start:)];self.disableButton=[self button:@"停用主題" action:@selector(disable:)];self.enableButton=[self button:@"重新啟用" action:@selector(enable:)];self.replayButton=[self button:@"重播開屏" action:@selector(replay:)];self.stopButton=[self button:@"停止並清理" action:@selector(stop:)];
  NSStackView *buttons=[NSStackView stackViewWithViews:@[self.startButton,self.disableButton,self.enableButton,self.replayButton,self.stopButton]];buttons.spacing=8;
  NSButton *help=[self button:@"使用、還原與移除說明" action:@selector(openHelp:)];
  NSStackView *stack=[NSStackView stackViewWithViews:@[self.headline,self.detail,buttons,note,help]];stack.orientation=NSUserInterfaceLayoutOrientationVertical;stack.alignment=NSLayoutAttributeLeading;stack.spacing=18;stack.translatesAutoresizingMaskIntoConstraints=NO;
  [self.window.contentView addSubview:stack];[NSLayoutConstraint activateConstraints:@[[stack.leadingAnchor constraintEqualToAnchor:self.window.contentView.leadingAnchor constant:24],[stack.trailingAnchor constraintEqualToAnchor:self.window.contentView.trailingAnchor constant:-24],[stack.topAnchor constraintEqualToAnchor:self.window.contentView.topAnchor constant:24]]];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.startedMs=NSDate.date.timeIntervalSince1970*1000;self.state=@"idle";
#if SANDRONE_LAUNCHER_TEST
  NSArray *args=NSProcessInfo.processInfo.arguments;NSUInteger index=[args indexOfObject:@"--self-test"];if(index!=NSNotFound&&index+1<args.count){self.testMode=args[index+1];self.testEvents=[NSMutableArray new];}
#endif
  [self buildInterface];[self showWindow:nil];[self start:nil];
#if SANDRONE_LAUNCHER_TEST
  if(self.testMode){[self start:nil];[self.window orderOut:nil];[self applicationShouldHandleReopen:NSApp hasVisibleWindows:NO];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,15*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(!self.testPassed){fprintf(stderr,"Cocoa fixture timed out\n");exit(2);}});}
#endif
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)visible { [self showWindow:nil];return YES; }
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return NO; }
- (NSMenu *)applicationDockMenu:(NSApplication *)sender {
  NSMenu *menu=[NSMenu new];for(NSArray *item in @[@[@"顯示啟動器",NSStringFromSelector(@selector(showWindow:))],@[@"重播開屏",NSStringFromSelector(@selector(replay:))],@[@"停用主題",NSStringFromSelector(@selector(disable:))],@[@"重新啟用",NSStringFromSelector(@selector(enable:))],@[@"停止並清理",NSStringFromSelector(@selector(stop:))]]){NSMenuItem *entry=[[NSMenuItem alloc] initWithTitle:item[0] action:NSSelectorFromString(item[1]) keyEquivalent:@""];entry.target=self;[menu addItem:entry];}return menu;
}
- (BOOL)validateMenuItem:(NSMenuItem *)item {
  if(item.action==@selector(replay:))return self.replayButton.enabled;
  if(item.action==@selector(disable:))return self.disableButton.enabled;
  if(item.action==@selector(enable:))return self.enableButton.enabled;
  if(item.action==@selector(stop:))return self.stopButton.enabled;
  return YES;
}
- (void)updateButtons {
  BOOL running=self.task!=nil,ready=[self.state isEqualToString:@"ready"],disabled=[self.state isEqualToString:@"disabled"],stopping=[self.state isEqualToString:@"stopping"];
  self.startButton.enabled=!running&&!self.quitting;self.stopButton.enabled=running&&!stopping;self.disableButton.enabled=running&&!stopping&&(ready||[self.state isEqualToString:@"starting"]);self.enableButton.enabled=running&&!stopping&&disabled;self.replayButton.enabled=running&&ready;
}
- (void)status:(NSString *)state message:(NSString *)message cleanup:(NSString *)cleanup {
  if([self.state isEqualToString:@"stopping"]&&[@[@"starting",@"ready",@"disabled"] containsObject:state])return;
  self.state=state;self.cleanup=cleanup;
  NSDictionary *titles=@{@"starting":@"正在準備主題與開屏",@"ready":@"程式驗證通過，畫面仍待驗收",@"disabled":@"主題已停用",@"stopping":@"正在停止與清理",@"stopped":@"載入器已停止",@"failed":@"啟動或運行失敗"};
  self.headline.stringValue=titles[state]?:@"桑多涅啟動器";
  NSString *details=message?:([state isEqualToString:@"ready"]?@"可使用下方按鈕控制本次啟動。不需要保持 Terminal 開啟。":@"請保留此啟動器運行；關閉視窗不會停止載入器。");
  if([state isEqualToString:@"disabled"])details=[cleanup isEqualToString:@"confirmed"]?@"本次清理已由程式確認；實際畫面與資源釋放仍請手動檢查。":@"清理未能完整確認。請先儲存工作，手動完全退出 ChatGPT，再從官方圖示啟動。";
  if([state isEqualToString:@"stopped"])details=[cleanup isEqualToString:@"unconfirmed"]?@"清理未能完整確認。請儲存工作並手動完全退出 ChatGPT，再由官方圖示啟動。":@"已停止監看。ChatGPT 若仍開著，請自行儲存並 Cmd+Q，才能關閉本次除錯端點；之後由官方圖示啟動即可。";
  self.detail.stringValue=details;[self updateButtons];
#if SANDRONE_LAUNCHER_TEST
  if(self.testMode){[self.testEvents addObject:@{ @"state":state,@"cleanup":cleanup?:@"none" }];[self advanceTest];}
#endif
}
- (void)start:(id)sender {
  if(self.task||self.quitting)return;
  NSError *error=nil;NSString *node=[[NSString stringWithContentsOfFile:[[self resources] stringByAppendingPathComponent:@"node-path.txt"] encoding:NSUTF8StringEncoding error:&error] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSString *script=[[self resources] stringByAppendingPathComponent:@"engine/macos-skin.mjs"];
#if SANDRONE_LAUNCHER_TEST
  if(self.testMode){node=[self.testMode isEqualToString:@"missing-node"]?@"/nonexistent-sandrone-node":NSProcessInfo.processInfo.environment[@"SANDRONE_TEST_NODE"];script=NSProcessInfo.processInfo.environment[@"SANDRONE_TEST_SCRIPT"];}
#endif
  if(!node.length||![[NSFileManager defaultManager] isExecutableFileAtPath:node]){[self status:@"failed" message:@"找不到建置時的 Node.js。請保留 Node.js 24 以上版本，並重新建置此啟動器；不要修改 ChatGPT。" cleanup:@"not-needed"];return;}
  self.token=NSUUID.UUID.UUIDString;self.errorTail=@"";self.pending=[NSMutableData new];self.commands=[NSPipe pipe];NSPipe *output=[NSPipe pipe];
  NSTask *task=[NSTask new];task.executableURL=[NSURL fileURLWithPath:node];task.arguments=@[script];task.standardInput=self.commands;task.standardOutput=output;task.standardError=output;
  NSMutableDictionary *environment=[NSProcessInfo.processInfo.environment mutableCopy];environment[@"SANDRONE_LAUNCHER_TOKEN"]=self.token;environment[@"SANDRONE_NATIVE_LAUNCH_START_MS"]=[NSString stringWithFormat:@"%.3f",self.startedMs];
#if SANDRONE_LAUNCHER_TEST
  if(self.testMode)environment[@"SANDRONE_FIXTURE_MODE"]=self.testMode;
#endif
  task.environment=environment;
  if(![task launchAndReturnError:&error]){[self status:@"failed" message:error.localizedDescription cleanup:@"not-needed"];return;}
  #if SANDRONE_LAUNCHER_TEST
  if(self.testMode)self.testLaunches++;
#endif
  self.task=task;[self status:@"starting" message:nil cleanup:nil];
  // Read and wait off the Cocoa main thread. Dispatch frames before exit so the
  // final cleanup status cannot lose a race against NSTask termination.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{@autoreleasepool{NSData *data;while((data=output.fileHandleForReading.availableData).length){dispatch_async(dispatch_get_main_queue(),^{[self receive:data];});}[task waitUntilExit];dispatch_async(dispatch_get_main_queue(),^{[self childEnded:task.terminationStatus];});}});
}
- (void)receive:(NSData *)data {
  [self.pending appendData:data];const unsigned char *bytes=self.pending.bytes;NSUInteger consumed=0;
  for(NSUInteger i=0;i<self.pending.length;i++){if(bytes[i]!='\n')continue;NSData *line=[self.pending subdataWithRange:NSMakeRange(consumed,i-consumed)];consumed=i+1;NSString *text=[[NSString alloc] initWithData:line encoding:NSUTF8StringEncoding];if(!text)continue;
    NSString *prefix=[NSString stringWithFormat:@"SANDRONE_LAUNCHER:%@:",self.token];
    if([text hasPrefix:prefix]){NSData *json=[[text substringFromIndex:prefix.length] dataUsingEncoding:NSUTF8StringEncoding];NSDictionary *event=[NSJSONSerialization JSONObjectWithData:json options:0 error:nil];if(![event isKindOfClass:NSDictionary.class])continue;
      if([event[@"type"] isEqual:@"status"]){[self status:event[@"state"] message:event[@"message"] cleanup:event[@"cleanup"]];}
      else if([event[@"type"] isEqual:@"command"]){if(![event[@"pass"] boolValue])self.detail.stringValue=event[@"message"]?:@"控制請求未能處理，請檢查本次載入器狀態。";else if([event[@"action"] isEqual:@"replay"])self.detail.stringValue=@"已排入重播請求；請以實際畫面確認。";
#if SANDRONE_LAUNCHER_TEST
        if(self.testMode&&[event[@"action"] isEqual:@"replay"]&&[event[@"pass"] boolValue]){self.testStep=4;[self performSelector:@selector(quit:) withObject:nil afterDelay:0];}
#endif
      }
    }else{self.errorTail=[self.errorTail stringByAppendingFormat:@"%@\n",text];if(self.errorTail.length>4000)self.errorTail=[self.errorTail substringFromIndex:self.errorTail.length-4000];}
  }
  if(consumed)[self.pending replaceBytesInRange:NSMakeRange(0,consumed) withBytes:NULL length:0];if(self.pending.length>8192)[self.pending replaceBytesInRange:NSMakeRange(0,self.pending.length-8192) withBytes:NULL length:0];
}
- (void)send:(NSString *)action {
  if(!self.task)return;NSDictionary *value=@{@"token":self.token,@"action":action,@"id":NSUUID.UUID.UUIDString};NSMutableData *data=[[NSJSONSerialization dataWithJSONObject:value options:0 error:nil] mutableCopy];[data appendData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
  @try{[self.commands.fileHandleForWriting writeData:data];}@catch(NSException *exception){self.detail.stringValue=@"載入器連線已中斷；請等候退出狀態，必要時儲存工作並手動退出 ChatGPT。";}
}
- (void)disable:(id)sender { if(self.disableButton.enabled)[self send:@"disable"]; }
- (void)enable:(id)sender { if(self.enableButton.enabled)[self send:@"enable"]; }
- (void)replay:(id)sender { if(self.replayButton.enabled)[self send:@"replay"]; }
- (void)stop:(id)sender { if(self.task&&![self.state isEqualToString:@"stopping"]){[self status:@"stopping" message:nil cleanup:nil];[self send:@"stop"];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(self.task&&[self.state isEqualToString:@"stopping"])self.detail.stringValue=@"仍在清理，未強制終止任何程序。請先儲存工作並手動完全退出 ChatGPT，再等候載入器結束。";});} }
- (void)childEnded:(int)status {
  self.task=nil;[self.commands.fileHandleForWriting closeFile];self.commands=nil;
  if(status!=0&&![self.state isEqualToString:@"failed"])[self status:@"failed" message:self.errorTail.length?self.errorTail:@"載入器意外結束。請儲存並完全退出 ChatGPT，再由官方圖示恢復；診斷可從選單開啟。" cleanup:@"unconfirmed"];
  else if(status==0&&![self.state isEqualToString:@"stopped"])[self status:@"stopped" message:nil cleanup:@"unconfirmed"];
  [self updateButtons];
#if SANDRONE_LAUNCHER_TEST
  if(self.testMode&&([self.testMode isEqualToString:@"child-error"]||[self.testMode isEqualToString:@"unconfirmed"])){self.testPassed=[self.testMode isEqualToString:@"child-error"]?[self.state isEqualToString:@"failed"]:[self.cleanup isEqualToString:@"unconfirmed"];[self performSelector:@selector(quit:) withObject:nil afterDelay:0];}
#endif
  if(self.quitting){
    if([self.cleanup isEqualToString:@"unconfirmed"]){self.quitting=NO;[NSApp replyToApplicationShouldTerminate:NO];[self showWindow:nil];[self updateButtons];
#if SANDRONE_LAUNCHER_TEST
      if([self.testMode isEqualToString:@"stop-unconfirmed"]){self.testCancelledQuits++;self.testPassed=YES;[self performSelector:@selector(quit:) withObject:nil afterDelay:0];}
#endif
    }else [NSApp replyToApplicationShouldTerminate:YES];
  }
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {if(!self.task)return NSTerminateNow;self.quitting=YES;[self stop:nil];
#if SANDRONE_LAUNCHER_TEST
 if(self.testMode)self.testTerminationDeferrals++;
#endif
 return NSTerminateLater;}
- (void)quit:(id)sender { [NSApp terminate:nil]; }
- (void)openHelp:(id)sender { [NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:[[self resources] stringByAppendingPathComponent:@"macos/START-HERE.html"]]]; }
- (void)openLogs:(id)sender {NSString *root=NSProcessInfo.processInfo.environment[@"SANDRONE_DATA_DIR"]?:[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/SandroneMacDev"];[NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:root]];}
#if SANDRONE_LAUNCHER_TEST
- (void)advanceTest {
  if([self.testMode isEqualToString:@"missing-node"]&&[self.state isEqualToString:@"failed"]){self.testPassed=YES;[self performSelector:@selector(quit:) withObject:nil afterDelay:0];return;}
  if([@[@"normal",@"stop-unconfirmed"] containsObject:self.testMode]){if(self.testStep==0&&[self.state isEqualToString:@"ready"]){self.testStep=1;[self disable:nil];}else if(self.testStep==1&&[self.state isEqualToString:@"disabled"]){self.testStep=2;[self enable:nil];}else if(self.testStep==2&&[self.state isEqualToString:@"ready"]){self.testStep=3;[self replay:nil];}else if(self.testStep==4&&[self.state isEqualToString:@"stopped"]){self.testPassed=[self.testMode isEqualToString:@"normal"]&&[self.cleanup isEqualToString:@"confirmed"];}}
}
- (void)applicationWillTerminate:(NSNotification *)notification {if(self.testMode){NSDictionary *result=@{@"pass":@(self.testPassed),@"mode":self.testMode,@"scope":@"Cocoa event loop and owned Node fixture only; real Dock and ChatGPT acceptance pending",@"events":self.testEvents,@"tasksLaunched":@(self.testLaunches),@"terminationDeferrals":@(self.testTerminationDeferrals),@"cancelledQuits":@(self.testCancelledQuits),@"dockVisiblePolicy":@((BOOL)(NSApp.activationPolicy==NSApplicationActivationPolicyRegular)),@"windowReopened":@(self.window.isVisible)};NSData *data=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];fwrite(data.bytes,1,data.length,stdout);fputc('\n',stdout);if(!self.testPassed)exit(2);}}
#endif
@end
int main(void){signal(SIGPIPE,SIG_IGN);@autoreleasepool{[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];SandroneLauncher *delegate=[SandroneLauncher new];NSApp.delegate=delegate;[NSApp run];}return 0;}
